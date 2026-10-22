// --- Auth flow ---
const authScreen = document.getElementById('authScreen');
const appShell = document.getElementById('appShell');
const authForm = document.getElementById('authForm');
const authError = document.getElementById('authError');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authSubmit = document.getElementById('authSubmit');
const authSwitchBtn = document.getElementById('authSwitchBtn');
const authSwitchText = document.getElementById('authSwitchText');
const nameField = document.getElementById('nameField');
const nameInput = document.getElementById('nameInput');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const userBadge = document.getElementById('userBadge');
const logoutBtn = document.getElementById('logoutBtn');

let authMode = 'login'; // 'login' | 'register'
let currentUser = null;

function setAuthMode(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  authTitle.textContent = isLogin ? 'Welcome back' : 'Create your account';
  authSubtitle.textContent = isLogin
    ? 'Sign in to use the calculator and keep your own history.'
    : 'Register to get a private history for your calculations.';
  authSubmit.textContent = isLogin ? 'Sign in' : 'Create account';
  authSwitchText.textContent = isLogin ? 'New here?' : 'Already have an account?';
  authSwitchBtn.textContent = isLogin ? 'Create an account' : 'Sign in instead';
  nameField.hidden = isLogin;
  passwordInput.setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
  authError.hidden = true;
}

function showAuthError(msg) {
  authError.textContent = '⚠ ' + msg;
  authError.hidden = false;
}

authSwitchBtn.onclick = () => setAuthMode(authMode === 'login' ? 'register' : 'login');

async function submitAuth(e) {
  e.preventDefault();
  authError.hidden = true;
  authSubmit.disabled = true;
  const payload = {
    email: emailInput.value.trim(),
    password: passwordInput.value,
  };
  if (authMode === 'register') payload.name = nameInput.value.trim();
  try {
    const r = await fetch('/api/auth/' + (authMode === 'login' ? 'login' : 'register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) { showAuthError(data.error || 'Authentication failed'); return; }
    currentUser = data.user;
    enterApp();
  } catch {
    showAuthError('Server unreachable. Is the backend running?');
  } finally {
    authSubmit.disabled = false;
  }
}
authForm.addEventListener('submit', submitAuth);

logoutBtn.onclick = async () => {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  currentUser = null;
  showAuthScreen();
};

function showAuthScreen() {
  authScreen.hidden = false;
  appShell.hidden = true;
  authForm.reset();
  setAuthMode('login');
}

function enterApp() {
  authScreen.hidden = true;
  appShell.hidden = false;
  userBadge.textContent = currentUser ? (currentUser.name || currentUser.email) : '';
  loadHistory();
}

async function checkSession() {
  try {
    const r = await fetch('/api/auth/me');
    if (r.ok) {
      const data = await r.json();
      currentUser = data.user;
      enterApp();
      return;
    }
  } catch { /* offline -> show login */ }
  showAuthScreen();
}

setAuthMode('login');
checkSession();

const exprEl = document.getElementById('expression');
const resultEl = document.getElementById('result');
const errorEl = document.getElementById('error');
const historyList = document.getElementById('historyList');
let expr = '';
let angleMode = 'deg';
let memory = 0;
let hasMemory = false;
let justEvaluated = false;

function render() {
  exprEl.textContent = expr || '0';
  errorEl.hidden = true;
}
function showError(msg) {
  errorEl.textContent = '⚠ ' + msg;
  errorEl.hidden = false;
}
function setAngle(mode) {
  angleMode = mode;
  document.getElementById('degBtn').classList.toggle('active', mode === 'deg');
  document.getElementById('radBtn').classList.toggle('active', mode === 'rad');
}
document.getElementById('degBtn').onclick = () => setAngle('deg');
document.getElementById('radBtn').onclick = () => setAngle('rad');
document.getElementById('themeBtn').onclick = () => {
  document.body.classList.toggle('light');
  document.getElementById('themeBtn').textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
};

document.querySelectorAll('[data-insert]').forEach((b) => {
  b.addEventListener('click', () => {
    if (justEvaluated && /^[0-9.)!]$/.test(b.dataset.insert[0]) === false && /^[0-9]/.test(b.dataset.insert) === false) {
      // keep chaining with previous result: e.g. after "= 5", pressing + keeps "5+"
      const m = resultEl.textContent.replace(/^=\s*/, '');
      if (m && m !== '0' && /^[+\-*/%^)]/.test(b.dataset.insert[0])) expr = m;
      else if (/^[a-z]/i.test(b.dataset.insert[0])) expr = '';
    }
    if (justEvaluated && /^[0-9.(a-z]/i.test(b.dataset.insert[0])) expr = '';
    justEvaluated = false;
    expr += b.dataset.insert;
    render();
    livePreview();
  });
});

document.getElementById('clearBtn').onclick = () => { expr = ''; justEvaluated = false; resultEl.textContent = '= 0'; render(); };
document.getElementById('backBtn').onclick = () => { expr = expr.slice(0, -1); render(); livePreview(); };

// Memory
document.querySelectorAll('[data-mem]').forEach((b) => {
  b.onclick = () => {
    const cur = parseFloat(resultEl.textContent.replace(/^=\s*/, '')) || 0;
    const op = b.dataset.mem;
    if (op === 'MC') { memory = 0; hasMemory = false; }
    if (op === 'MR') { expr += String(memory); render(); }
    if (op === 'M+') { memory += cur; hasMemory = true; }
    if (op === 'M-') { memory -= cur; hasMemory = true; }
    if (op === 'MS') { memory = cur; hasMemory = true; }
    document.getElementById('memIndicator').hidden = !hasMemory;
  };
});

async function livePreview() {
  if (!expr.trim()) { resultEl.textContent = '= 0'; return; }
  try {
    const r = await fetch('/api/calculate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression: expr, angleMode }),
    });
    // live preview should NOT spam history: so compute locally via backend? Instead just skip saving:
    // We already saved on server — remove that entry to avoid spam, then show value.
    if (r.ok) {
      const data = await r.json();
      resultEl.textContent = '= ' + data.result;
      await fetch('/api/history/' + data.id, { method: 'DELETE' });
      loadHistory();
    }
  } catch { /* ignore live errors */ }
}

async function equals() {
  if (!expr.trim()) return;
  try {
    const r = await fetch('/api/calculate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression: expr, angleMode }),
    });
    const data = await r.json();
    if (r.status === 401) { if (!currentUser) showAuthScreen(); return; }
    if (!r.ok) { showError(data.error || 'Error'); return; }
    resultEl.textContent = '= ' + data.result;
    justEvaluated = true;
    loadHistory();
  } catch (e) { showError('Server unreachable. Is backend running?'); }
}
document.getElementById('equalsBtn').onclick = equals;

async function loadHistory() {
  try {
    const r = await fetch('/api/history');
    if (r.status === 401) { if (!currentUser) showAuthScreen(); return; }
    const items = await r.json();
    if (!items.length) { historyList.innerHTML = '<p class="empty">No calculations yet.</p>'; return; }
    historyList.innerHTML = '';
    items.forEach((h) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `<div class="expr"></div><div class="res"></div>
        <div class="meta"><span>${h.angleMode.toUpperCase()} • ${new Date(h.createdAt).toLocaleString()}</span><button class="del">✕</button></div>`;
      div.querySelector('.expr').textContent = h.expression;
      div.querySelector('.res').textContent = '= ' + h.result;
      div.querySelector('.res').onclick = div.querySelector('.expr').onclick = () => {
        expr = h.expression; justEvaluated = false; render();
        resultEl.textContent = '= ' + h.result;
      };
      div.querySelector('.del').onclick = async (e) => {
        e.stopPropagation();
        await fetch('/api/history/' + h.id, { method: 'DELETE' });
        loadHistory();
      };
      historyList.appendChild(div);
    });
  } catch { historyList.innerHTML = '<p class="empty">Could not load history.</p>'; }
}
document.getElementById('clearHistoryBtn').onclick = async () => {
  await fetch('/api/history', { method: 'DELETE' });
  loadHistory();
};

// Keyboard support
document.addEventListener('keydown', (e) => {
  if (/^[0-9+\-*/%^().!]$/.test(e.key)) { expr += e.key; justEvaluated = false; render(); livePreview(); }
  else if (e.key === 'Enter') { e.preventDefault(); equals(); }
  else if (e.key === 'Backspace') { expr = expr.slice(0, -1); render(); }
  else if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) { expr = ''; render(); resultEl.textContent = '= 0'; }
  else if (e.key === '^') { expr += '^'; render(); }
});

render();
