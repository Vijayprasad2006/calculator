const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { evaluate } = require('./lib/calculator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50kb' }));
// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// --- History persistence (JSON file, max 100 entries) ---
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
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(0, 100), null, 2));
  } catch (e) {
    console.error('Failed to save history:', e.message);
  }
}

// --- API ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/functions', (req, res) => {
  res.json({
    functions: ['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','ln','log','sqrt','cbrt','abs','floor','ceil','round','trunc','exp','fact'],
    constants: ['pi', 'e'],
    operators: ['+', '-', '*', '/', '%', '^', '!', '(', ')'],
  });
});

app.post('/api/calculate', (req, res) => {
  const { expression, angleMode } = req.body || {};
  try {
    if (typeof expression !== 'string' || !expression.trim()) {
      return res.status(400).json({ error: 'Expression is required' });
    }
    const mode = angleMode === 'rad' ? 'rad' : 'deg';
    const result = evaluate(expression, mode);
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      expression: expression.trim(),
      result,
      angleMode: mode,
      createdAt: new Date().toISOString(),
    };
    history.unshift(entry);
    history = history.slice(0, 100);
    saveHistory();
    res.json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Calculation failed' });
  }
});

app.get('/api/history', (req, res) => {
  res.json(history);
});

app.delete('/api/history', (req, res) => {
  history = [];
  saveHistory();
  res.json({ ok: true });
});

app.delete('/api/history/:id', (req, res) => {
  history = history.filter((h) => h.id !== req.params.id);
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
