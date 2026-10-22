# demo1 — Full-Stack Scientific Calculator

Backend: **Node.js + Express** (`server.js`)
Frontend: **HTML + CSS + JS** (`public/`)
Math engine: safe parser, no `eval()` (`lib/calculator.js`)

## Features
- Basic: `+ - * / % ^ ( )` , decimals, `00`, unary minus
- Scientific: `sin cos tan asin acos atan sinh cosh tanh ln log sqrt cbrt abs floor ceil round trunc exp fact`, postfix `!` (e.g. `5!`), constants `pi`, `e`
- DEG / RAD toggle, memory (MC MR M+ M− MS), keyboard support, live preview
- Backend API with persistent history (`history.json`, max 100)
- **Auth**: email + password sign-up/sign-in, bcrypt-hashed passwords, httpOnly session cookies, per-user private history

## Auth system
- Users are stored in `data/users.json` (git-ignored). Passwords are hashed with **bcrypt** (10 rounds) — never stored or logged in plain text.
- Sessions live in `data/sessions.json`; the browser gets an httpOnly, `SameSite=Lax` cookie named `sid` (7-day sliding expiry). `Secure` is enabled automatically when served over HTTPS.
- All calculator + history endpoints require a valid session (`401` otherwise). History rows are scoped to the signed-in user, so users cannot see or delete each other's entries.
- Extra hardening: login brute-force throttling (5 failed attempts per IP+email per 10 min → `429`), same-origin check on state-changing requests (CSRF mitigation), and CORS restricted to same-origin.
- The UI shows a sign-in/sign-up screen until you log in; the calculator stays hidden until then.

### Auth API
| Method | Route | Body | Description |
|---|---|---|---|
| POST | `/api/auth/register` | `{ "email", "password", "name" }` | create account + start session |
| POST | `/api/auth/login` | `{ "email", "password" }` | start session |
| POST | `/api/auth/logout` | — | destroy session |
| GET | `/api/auth/me` | — | current user (`401` if not signed in) |

## Run
```bash
cd ~/Downloads/demo1
npm install
npm start
# open http://localhost:3000
```

## API
| Method | Route | Body | Description |
|---|---|---|---|
| GET | `/api/health` | — | health check |
| GET | `/api/functions` | — | supported ops |
| POST | `/api/calculate` 🔒 | `{ "expression": "sin(30)+2^3", "angleMode": "deg" }` | evaluate |
| GET | `/api/history` 🔒 | — | list your history |
| DELETE | `/api/history` 🔒 | — | clear your history |
| DELETE | `/api/history/:id` 🔒 | — | delete one entry |

🔒 = requires an authenticated session.

Example:
```bash
# log in first, then reuse the cookie
curl -c jar.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"secret123"}'

curl -b jar.txt -X POST http://localhost:3000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"expression":"sqrt(16)+2^3","angleMode":"deg"}'
# => {"expression":"sqrt(16)+2^3","result":12,...}
```

## Project structure
```
demo1/
├── server.js            # Express server + API + static hosting
├── lib/
│   ├── calculator.js    # tokenizer → shunting-yard → RPN evaluator
│   └── auth.js          # users, bcrypt hashing, sessions, middleware
├── public/
│   ├── index.html       # calculator UI + auth screen
│   ├── styles.css       # dark/light theme
│   └── app.js           # frontend logic (fetch API, history, memory, auth)
├── data/                # users.json + sessions.json (git-ignored, auto-created)
├── history.json         # auto-created persistent history
└── package.json
```
