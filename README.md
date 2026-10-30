# TradePulse

**Plan. Track. Perform.**

Capital-first analytics, structured compounding schedules, and automated trading strategies powered by Deriv.

## Features

- **TradePulse Analytics** — My Journey, Master Schedule, Performance, and Account tabs for disciplined equity compounding and real-time session telemetry
- **Bot Builder** — Visual strategy builder powered by Blockly 10 with automated Deriv execution
- **Auto Trades & Scanners** — Quantitative market scanners and automated tick-level execution engines
- **Manual Trade** — Direct digit & contract placement workspace with live frequency histograms
- **Trading Bots & Risk Calculator** — Pre-built XML bots, capital allocation calculator, and strategy playbooks
- **Smart Charts** — Real-time market charts via SmartCharts Champion
- **OAuth 2.0 + PKCE Authentication** — Secure Deriv account integration

## Tech Stack

- React 18 + TypeScript
- MobX (`mobx-react-lite`) for state management
- Rsbuild / Rspack for bundling
- Blockly 10 for visual strategy programming
- Deriv WebSocket API & SmartCharts Champion

## Getting Started

```bash
# copy environment template and configure your Deriv App ID
cp .env.example .env

# install dependencies
pnpm install

# start development server on port 4003
npm run dev

# production build
npm run build
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 4003 |
| `npm run build` | Production build |
| `npm run generate:brand-css` | Regenerate `_themes.scss` tokens from `brand.config.json` |
| `npm run test` | Run Jest test suites |
| `npm run type-check` | TypeScript type checking |

## License

Private — All rights reserved
