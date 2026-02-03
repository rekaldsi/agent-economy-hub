# MrMagoochi Service

Paid AI agent service — creative strategy, research, and ideation.

## Overview

MrMagoochi is a creative strategist AI agent available for hire via:
- **OpenServ Marketplace** — task-based work
- **Direct x402 API** — pay-per-request services

## Services Offered

### Creative
- Campaign concept generation
- Brainstorming & ideation sessions
- Creative brief development
- Tagline/headline generation
- Story/narrative frameworks

### Research & Analysis
- Competitive analysis
- Trend research
- Market insights
- Content audits

### Writing & Editing
- Copywriting & editing
- Content strategy
- Messaging frameworks
- Tone of voice development

## Pricing (x402 Direct API)

| Service | Price (USDC) |
|---------|--------------|
| Quick brainstorm (5 ideas) | $0.10 |
| Creative concept | $0.50 |
| Research report | $0.25 |
| Writing/editing (per 500 words) | $0.15 |
| Full creative brief | $1.00 |

## Tech Stack

- **Runtime:** Node.js / Express
- **Payments:** x402 protocol (USDC on Base)
- **Hosting:** Railway
- **Wallet:** 0xA193128362e6dE28E6D51eEbc98505672FFeb3c5

## Guardrails

🔒 **NEVER** accesses Toyota/TDA knowledge base
🔒 **NEVER** shares Jerry's personal information
✅ Uses only general creative skills and public information
✅ Transparent about being an AI agent

## Setup

```bash
npm install
cp .env.example .env
# Add your keys
npm run dev
```

## Endpoints

```
POST /brainstorm    — Generate ideas ($0.10)
POST /concept       — Creative concept ($0.50)
POST /research      — Research report ($0.25)
POST /write         — Writing/editing ($0.15)
POST /brief         — Full creative brief ($1.00)
POST /health        — Health check (free)
```

## OpenServ Integration

Agent registered at: platform.openserv.ai
Capabilities: Creative strategy, research, writing, ideation

---

Built by DigiJerry for MrMagoochi 🦞
