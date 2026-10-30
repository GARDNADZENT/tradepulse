# TradePulse

Capital-first analytics and automated trading platform powered by Deriv.

## Features

- **TradePulse Analytics** — Dashboard, My Journey, Master Schedule, Performance, and Account tabs for lifetime trading analytics
- **Bot Builder** — Visual strategy builder powered by Blockly with automated execution
- **Manual Trade** — Direct trade placement interface
- **Trading Bots** — Pre-built automated strategies
- **Smart Charts** — Real-time market charts via Smart Charts Champion
- **OAuth Authentication** — Secure Deriv account integration

## Tech Stack

- React + TypeScript
- MobX for state management
- RSBuild for bundling
- Blockly for visual programming
- Deriv API / WebSocket

## Getting Started

```bash
# install dependencies
npm install

# run dev server
npm run dev

# type check
npm run type-check

# build for production
npm run build
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 4003 |
| `npm run build` | Production build |
| `npm run test` | Run tests |
| `npm run type-check` | TypeScript type checking |

## Environment Variables

Required for local development:

```
NEXT_PUBLIC_DERIV_APP_ID=<your-deriv-app-id>
```

## License

Private — All rights reserved
