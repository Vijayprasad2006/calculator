# demo1 — Full-Stack Scientific Calculator

Backend: **Node.js + Express** (`server.js`)
Frontend: **HTML + CSS + JS** (`public/`)
Math engine: safe parser, no `eval()` (`lib/calculator.js`)

## Features
- Basic: `+ - * / % ^ ( )` , decimals, `00`, unary minus
- Scientific: `sin cos tan asin acos atan sinh cosh tanh ln log sqrt cbrt abs floor ceil round trunc exp fact`, postfix `!` (e.g. `5!`), constants `pi`, `e`
- DEG / RAD toggle, memory (MC MR M+ M− MS), keyboard support, live preview
- Backend API with persistent history (`history.json`, max 100)

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
| POST | `/api/calculate` | `{ "expression": "sin(30)+2^3", "angleMode": "deg" }` | evaluate |
| GET | `/api/history` | — | list history |
| DELETE | `/api/history` | — | clear history |
| DELETE | `/api/history/:id` | — | delete one entry |

Example:
```bash
curl -X POST http://localhost:3000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"expression":"sqrt(16)+2^3","angleMode":"deg"}'
# => {"expression":"sqrt(16)+2^3","result":12,...}
```

## Project structure
```
demo1/
├── server.js            # Express server + API + static hosting
├── lib/calculator.js    # tokenizer → shunting-yard → RPN evaluator
├── public/
│   ├── index.html       # calculator UI
│   ├── styles.css       # dark/light theme
│   └── app.js           # frontend logic (fetch API, history, memory)
├── history.json         # auto-created persistent history
└── package.json
```
