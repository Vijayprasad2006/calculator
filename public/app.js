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
loadHistory();
