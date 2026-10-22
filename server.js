const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { evaluate } = require('./lib/calculator');
const {
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
} = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Only allow same-origin browser requests (the frontend is served by this app).
app.use(cors({ origin: false }));
app.use(express.json({ limit: '50kb' }));
app.use(attachUser);
// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// --- History persistence (JSON file, max 100 entries per user) ---
const HISTORY_FILE = path.join(__dirname, 'history.json');
let history = [];
try {
  if (fs.existsSync(HISTORY_FILE)) {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    if (!Array.isArray(history)) history = [];
  }
} catch { history = []; }

function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(0, 500), null, 2));
  } catch (e) {
    console.error('Failed to save history:', e.message);
  }
}

function userHistory(userId) {
  return history.filter((h) => h.userId === userId);
}

// --- Auth API ---
app.post('/api/auth/register', requireSameOrigin, async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    const result = await registerUser({ email, password, name });
    if (result.error) return res.status(400).json({ error: result.error });
    const token = createSession(result.user.id);
    res.cookie('sid', token, sessionCookieOptions(req));
    res.status(201).json({ user: publicUser(result.user) });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', requireSameOrigin, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (isRateLimited(req, email)) {
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }
    const user = findUserByEmail(email);
    const ok = await verifyPassword(user, password);
    if (!ok) {
      recordFailure(req, email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    clearFailures(req, email);
    const token = createSession(user.id);
    res.cookie('sid', token, sessionCookieOptions(req));
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', requireSameOrigin, (req, res) => {
  destroySession(req.sessionToken);
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated', user: null });
  res.json({ user: publicUser(req.user) });
});

// --- API ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), authenticated: !!req.user });
});

app.get('/api/functions', (req, res) => {
  res.json({
    functions: ['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','ln','log','sqrt','cbrt','abs','floor','ceil','round','trunc','exp','fact'],
    constants: ['pi', 'e'],
    operators: ['+', '-', '*', '/', '%', '^', '!', '(', ')'],
  });
});

app.post('/api/calculate', requireAuth, requireSameOrigin, (req, res) => {
  const { expression, angleMode } = req.body || {};
  try {
    if (typeof expression !== 'string' || !expression.trim()) {
      return res.status(400).json({ error: 'Expression is required' });
    }
    const mode = angleMode === 'rad' ? 'rad' : 'deg';
    const result = evaluate(expression, mode);
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      userId: req.user.id,
      expression: expression.trim(),
      result,
      angleMode: mode,
      createdAt: new Date().toISOString(),
    };
    history.unshift(entry);
    history = history.slice(0, 500);
    saveHistory();
    res.json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Calculation failed' });
  }
});

app.get('/api/history', requireAuth, (req, res) => {
  res.json(userHistory(req.user.id).slice(0, 100));
});

app.delete('/api/history', requireAuth, requireSameOrigin, (req, res) => {
  history = history.filter((h) => h.userId !== req.user.id);
  saveHistory();
  res.json({ ok: true });
});

app.delete('/api/history/:id', requireAuth, requireSameOrigin, (req, res) => {
  history = history.filter((h) => !(h.userId === req.user.id && h.id === req.params.id));
  saveHistory();
  res.json({ ok: true });
});

// Fallback to index.html for any non-API route
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Scientific Calculator running at http://localhost:${PORT}\n`);
});
