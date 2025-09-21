# Psundai Dapp

A tiny, static front-end (HTML + JS) to connect a wallet and interact with Psundai on PulseChain.
No build tools, no Node — just open a local web server and go.

## Quick Start (Windows)
1) Download / clone this repo.
2) Double-click `serve.cmd` to start a local server at http://localhost:8080/
3) Open http://localhost:8080/ in a browser with a wallet extension installed.

## File Structure
psundai/
├─ index.html     # UI and script tags
├─ app.js         # Dapp logic (wallet connect, contract calls)
└─ serve.cmd      # One-click local server (Windows)

## Troubleshooting
- Use http://localhost:8080 (not file://)
- Make sure your wallet extension is installed and unlocked.
- Contract reverts come from on-chain rules (allowance, cooldowns, balances, network).
