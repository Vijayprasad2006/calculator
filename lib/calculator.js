/**
 * Safe scientific expression evaluator (no eval).
 * Supports: + - * / % ^ , parentheses, unary minus/plus,
 * functions: sin cos tan asin acos atan sinh cosh tanh ln log sqrt cbrt abs floor ceil round trunc exp fact
 * constants: pi e, postfix factorial !
 * Angle mode: 'deg' | 'rad' for trig functions.
 */
const FUNCTIONS = new Set([
  'sin','cos','tan','asin','acos','atan',
  'sinh','cosh','tanh','ln','log','sqrt','cbrt',
  'abs','floor','ceil','round','trunc','exp','fact'
]);
const CONSTANTS = { pi: Math.PI, e: Math.E };

function factorial(n) {
  if (n < 0) throw new Error('Factorial of negative number');
  if (!Number.isInteger(n)) throw new Error('Factorial only supports integers');
  if (n > 170) throw new Error('Factorial overflow');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function applyFunction(name, arg, angleMode) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  switch (name) {
    case 'sin': return Math.sin(angleMode === 'deg' ? toRad(arg) : arg);
    case 'cos': return Math.cos(angleMode === 'deg' ? toRad(arg) : arg);
    case 'tan': return Math.tan(angleMode === 'deg' ? toRad(arg) : arg);
    case 'asin': { const v = Math.asin(arg); if (Number.isNaN(v)) throw new Error('asin domain: [-1,1]'); return angleMode === 'deg' ? toDeg(v) : v; }
    case 'acos': { const v = Math.acos(arg); if (Number.isNaN(v)) throw new Error('acos domain: [-1,1]'); return angleMode === 'deg' ? toDeg(v) : v; }
    case 'atan': { const v = Math.atan(arg); return angleMode === 'deg' ? toDeg(v) : v; }
    case 'sinh': return Math.sinh(arg);
    case 'cosh': return Math.cosh(arg);
    case 'tanh': return Math.tanh(arg);
    case 'ln': if (arg <= 0) throw new Error('ln domain: x > 0'); return Math.log(arg);
    case 'log': if (arg <= 0) throw new Error('log domain: x > 0'); return Math.log10(arg);
    case 'sqrt': if (arg < 0) throw new Error('sqrt of negative number'); return Math.sqrt(arg);
    case 'cbrt': return Math.cbrt(arg);
    case 'abs': return Math.abs(arg);
    case 'floor': return Math.floor(arg);
    case 'ceil': return Math.ceil(arg);
    case 'round': return Math.round(arg);
    case 'trunc': return Math.trunc(arg);
    case 'exp': return Math.exp(arg);
    case 'fact': return factorial(arg);
    default: throw new Error('Unknown function: ' + name);
  }
}

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const s = expr.replace(/\s+/g, '');
  const src = s.replace(/\u00d7/g, '*').replace(/\u00f7/g, '/').replace(/\u2212/g, '-').replace(/\u03c0/g, 'pi');
  while (i < src.length) {
    const ch = src[i];
    if (/[0-9.]/.test(ch)) {
      let num = ''; let dots = 0;
      while (i < src.length && /[0-9.]/.test(src[i])) { if (src[i] === '.') dots++; if (dots > 1) throw new Error('Invalid number'); num += src[i++]; }
      if (num === '.' || num === '') throw new Error('Invalid number');
      const v = parseFloat(num);
      if (Number.isNaN(v)) throw new Error('Invalid number: ' + num);
      tokens.push({ type: 'number', value: v });
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let word = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) word += src[i++];
      word = word.toLowerCase();
      if (word in CONSTANTS) tokens.push({ type: 'number', value: CONSTANTS[word] });
      else if (FUNCTIONS.has(word)) tokens.push({ type: 'func', value: word });
      else throw new Error('Unknown identifier: ' + word);
      continue;
    }
    if (ch === '(' || ch === ')') { tokens.push({ type: 'paren', value: ch }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', value: ch }); i++; continue; }
    if ('+-*/%^!'.includes(ch)) {
      if (ch === '*' && src[i+1] === '*') { tokens.push({ type: 'op', value: '^' }); i += 2; continue; }
      tokens.push({ type: 'op', value: ch }); i++; continue;
    }
    throw new Error("Invalid character: '" + ch + "'");
  }
  return tokens;
}
function toRPN(tokens) {
  const out = [];
  const stack = [];
  const prec = { '+': 2, '-': 2, '*': 3, '/': 3, '%': 3, '^': 4, 'u-': 5, 'u+': 5 };
  const rightAssoc = new Set(['^', 'u-', 'u+']);
  let prev = null;
  const isUnary = (op) => {
    if (op !== '+' && op !== '-') return false;
    if (!prev) return true;
    if (prev.type === 'op' && prev.value !== '!') return true;
    if (prev.type === 'paren' && prev.value === '(') return true;
    if (prev.type === 'comma') return true;
    return false;
  };
  for (const tok of tokens) {
    if (tok.type === 'number') { out.push(tok); }
    else if (tok.type === 'func') { stack.push(tok); }
    else if (tok.type === 'op') {
      if (tok.value === '!') { out.push({ type: 'op', value: '!' }); prev = { type: 'number', value: 0 }; continue; }
      let cur = tok;
      if (isUnary(tok.value)) cur = { type: 'op', value: tok.value === '-' ? 'u-' : 'u+' };
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.type === 'op') {
          const p1 = prec[cur.value] || 0, p2 = prec[top.value] || 0;
          if (p2 > p1 || (p2 === p1 && !rightAssoc.has(cur.value))) out.push(stack.pop());
          else break;
        } else if (top.type === 'func') { out.push(stack.pop()); }
        else break;
      }
      stack.push(cur);
    } else if (tok.type === 'paren') {
      if (tok.value === '(') stack.push(tok);
      else {
        let found = false;
        while (stack.length) {
          const top = stack.pop();
          if (top.type === 'paren' && top.value === '(') { found = true; break; }
          out.push(top);
        }
        if (!found) throw new Error('Mismatched parentheses');
        if (stack.length && stack[stack.length-1].type === 'func') out.push(stack.pop());
      }
    } else if (tok.type === 'comma') {
      while (stack.length && !(stack[stack.length-1].type === 'paren' && stack[stack.length-1].value === '(')) out.push(stack.pop());
      if (!stack.length) throw new Error('Misplaced comma');
    }
    prev = tok;
    if (tok.type === 'op' && tok.value === '!') prev = { type: 'number', value: 0 };
  }
  while (stack.length) { const top = stack.pop(); if (top.type === 'paren') throw new Error('Mismatched parentheses'); out.push(top); }
  return out;
}

function evalRPN(rpn, angleMode) {
  const st = [];
  for (const tok of rpn) {
    if (tok.type === 'number') st.push(tok.value);
    else if (tok.type === 'func') {
      if (st.length < 1) throw new Error('Not enough arguments for ' + tok.value);
      const a = st.pop();
      st.push(applyFunction(tok.value, a, angleMode));
    } else if (tok.type === 'op') {
      if (tok.value === 'u-') { if (st.length < 1) throw new Error('Invalid expression'); st.push(-st.pop()); }
      else if (tok.value === 'u+') { if (st.length < 1) throw new Error('Invalid expression'); st.push(+st.pop()); }
      else if (tok.value === '!') { if (st.length < 1) throw new Error('Invalid expression'); st.push(factorial(st.pop())); }
      else {
        if (st.length < 2) throw new Error('Invalid expression');
        const b = st.pop(), a = st.pop();
        if (tok.value === '+') st.push(a + b);
        else if (tok.value === '-') st.push(a - b);
        else if (tok.value === '*') st.push(a * b);
        else if (tok.value === '/') { if (b === 0) throw new Error('Division by zero'); st.push(a / b); }
        else if (tok.value === '%') { if (b === 0) throw new Error('Modulo by zero'); st.push(a % b); }
        else if (tok.value === '^') st.push(Math.pow(a, b));
        else throw new Error('Unknown operator: ' + tok.value);
      }
    }
  }
  if (st.length !== 1) throw new Error('Invalid expression');
  const result = st[0];
  if (typeof result !== 'number' || Number.isNaN(result)) throw new Error('Result is not a number');
  if (!Number.isFinite(result)) throw new Error('Result overflow (Infinity)');
  const rounded = Math.abs(result) < 1e-15 ? 0 : parseFloat(result.toPrecision(12));
  return rounded;
}

function evaluate(expression, angleMode) {
  if (typeof expression !== 'string' || !expression.trim()) throw new Error('Empty expression');
  if (expression.length > 500) throw new Error('Expression too long');
  const mode = angleMode === 'rad' ? 'rad' : 'deg';
  const tokens = tokenize(expression);
  if (!tokens.length) throw new Error('Empty expression');
  const rpn = toRPN(tokens);
  return evalRPN(rpn, mode);
}
module.exports = { evaluate, tokenize };
