const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const BCRYPT_ROUNDS = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 1000 * 60 * 10; // 10 minutes

// --- storage helpers ---

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create data dir:', e.message);
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDataDir();
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } catch (e) {
    console.error('Failed to write', path.basename(file) + ':', e.message);
  }
}

let users = readJson(USERS_FILE, []);
if (!Array.isArray(users)) users = [];
let sessions = readJson(SESSIONS_FILE, {});
if (typeof sessions !== 'object' || sessions === null || Array.isArray(sessions)) sessions = {};

function saveUsers() {
  writeJson(USERS_FILE, users);
}

function saveSessions() {
  writeJson(SESSIONS_FILE, sessions);
}

// --- users ---

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

function findUserByEmail(email) {
  const e = normalizeEmail(email);
  return users.find((u) => u.email === e) || null;
}

function validateCredentials({ email, password, name }) {
  const e = normalizeEmail(email);
  if (!e) return { error: 'Email is required' };
  if (!EMAIL_RE.test(e)) return { error: 'Invalid email address' };
  if (typeof password !== 'string' || password.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }
  if (password.length > 200) return { error: 'Password is too long' };
  if (name !== undefined && name !== null && String(name).trim().length > 80) {
    return { error: 'Name is too long' };
  }
  return { value: { email: e, password, name: String(name || '').trim() } };
}

async function registerUser({ email, password, name }) {
  const check = validateCredentials({ email, password, name });
  if (check.error) return { error: check.error };
  if (findUserByEmail(check.value.email)) {
    return { error: 'An account with that email already exists' };
  }
  const user = {
    id: crypto.randomUUID(),
    email: check.value.email,
    name: check.value.name || check.value.email.split('@')[0],
    passwordHash: await bcrypt.hash(check.value.password, BCRYPT_ROUNDS),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers();
  return { user };
}

async function verifyPassword(user, password) {
  if (!user || typeof password !== 'string') return false;
  return bcrypt.compare(password, user.passwordHash);
}

// --- sessions ---

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
  pruneSessions();
  saveSessions();
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions[token];
  if (!s) return null;
  if (s.expiresAt <= Date.now()) {
    delete sessions[token];
    saveSessions();
    return null;
  }
  return s;
}

function destroySession(token) {
  if (token && sessions[token]) {
    delete sessions[token];
    saveSessions();
  }
}

function pruneSessions() {
  const now = Date.now();
  let changed = false;
  for (const [token, s] of Object.entries(sessions)) {
    if (!s || s.expiresAt <= now) {
      delete sessions[token];
      changed = true;
    }
  }
  if (changed) saveSessions();
}

function sessionCookieOptions(req) {
  const secure = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
  return { httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_TTL_MS, path: '/' };
}

// --- cookies ---

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

// --- middleware ---

function attachUser(req, res, next) {
  req.cookies = parseCookies(req);
  req.sessionToken = req.cookies.sid || null;
  const session = getSession(req.sessionToken);
  req.user = session ? users.find((u) => u.id === session.userId) || null : null;
  if (req.user && session) {
    // sliding expiration: keep active users signed in
    session.expiresAt = Date.now() + SESSION_TTL_MS;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
  }
  next();
}

// Basic CSRF mitigation for cookie-authenticated state-changing requests:
// browsers must not send cross-site requests with our Origin header.
function requireSameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.get('origin');
  if (!origin) return next(); // non-browser client (curl/fetch without Origin)
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Invalid origin' });
  }
  if (originHost !== req.get('host')) {
    return res.status(403).json({ error: 'Cross-origin request blocked' });
  }
  next();
}

// --- brute-force protection ---

const attempts = new Map(); // key -> { count, firstAt }

function attemptKey(req, email) {
  return `${req.ip}|${normalizeEmail(email)}`;
}

function isRateLimited(req, email) {
  const key = attemptKey(req, email);
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.firstAt > ATTEMPT_WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return rec.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailure(req, email) {
  const key = attemptKey(req, email);
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.firstAt > ATTEMPT_WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    rec.count += 1;
  }
}

function clearFailures(req, email) {
  attempts.delete(attemptKey(req, email));
}

module.exports = {
  registerUser,
  verifyPassword,
  findUserByEmail,
  publicUser,
  createSession,
  destroySession,
  attachUser,
  requireAuth,
  requireSameOrigin,
  isRateLimited,
  recordFailure,
  clearFailures,
  sessionCookieOptions,
  normalizeEmail,
};
