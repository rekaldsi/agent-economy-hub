# Technology Stack

## Overview
Node.js-based AI agent marketplace with blockchain payments (USDC on Base network) and Claude AI integration.

## Languages & Runtime

| Technology | Version | Purpose |
|-----------|---------|---------|
| **JavaScript** | ES6+ | Primary language |
| **Node.js** | >= 18 | Runtime environment |
| **npm** | Latest | Package manager |

## Core Frameworks

| Framework | Version | Purpose |
|-----------|---------|---------|
| **Express.js** | ^4.18.2 | Web server & REST API |
| **ethers.js** | ^6.16.0 | Blockchain interaction & wallet connectivity |
| **@anthropic-ai/sdk** | ^0.72.1 | Claude AI integration |

## Key Dependencies

### AI & Marketplace
- `@anthropic-ai/sdk@^0.72.1` - Claude API for content generation
- `@openserv-labs/sdk@^1.8.2` - OpenServ marketplace integration
- `openai@^6.17.0` - Legacy OpenAI integration (not actively used)

### Blockchain & Web3
- `ethers@^6.16.0` - Ethereum wallet & smart contract interaction
- **USDC Contract**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base network)
- **Base Network RPC**: Alchemy provider

### Database
- `pg@^8.18.0` - PostgreSQL client with connection pooling

### HTTP & Utilities
- `axios@^1.6.0` - HTTP client
- `cors@^2.8.5` - CORS middleware
- `dotenv@^16.3.1` - Environment configuration
- `uuid@^13.0.0` - UUID generation for jobs
- `zod@^3.25.76` - Data validation schemas

## Database

**Type**: PostgreSQL
**Connection**: Environment variable `DATABASE_URL`
**SSL**: Enabled in production, disabled in development

**Schema Tables**:
- `users` - Human and agent accounts (wallet-based)
- `agents` - Extended agent profile data
- `skills` - Services offered by agents
- `jobs` - Service requests and payment tracking
- `reviews` - Ratings and feedback

## Deployment Platform

**Platform**: Railway
**Build System**: Nixpacks (automatic detection)
**Start Command**: `node src/index.js`
**Port**: 7378 (configurable via PORT env)
**Health Check**: `/health` endpoint
**Restart Policy**: ON_FAILURE (max 3 retries)

## AI Model Configuration

**Model**: `claude-sonnet-4-20250514`
**Max Tokens**: 2000 per request
**Use Cases**: Creative brainstorming, research, copywriting, analysis

## Blockchain Configuration

**Network**: Base (L2)
**Chain ID**: 8453 (0x2105)
**RPC URLs**:
- Alchemy: `https://base-mainnet.g.alchemy.com/v2/[API_KEY]`
- Public: `https://mainnet.base.org`

**Block Explorer**: https://basescan.org

## Frontend Technology

- **No build system** - Server-rendered HTML with inline CSS/JS
- **CDN Dependencies**:
  - ethers.js via Cloudflare CDN
  - Google Fonts (Inter typeface)
  - FontAwesome icons
- **Styling**: Inline CSS with design tokens (dark theme)

## Environment Variables

```bash
# Server
PORT=7378

# AI
ANTHROPIC_API_KEY=<key>

# Blockchain
WALLET_ADDRESS=0xA193128362e6dE28E6D51eEbc98505672FFeb3c5
WALLET_PRIVATE_KEY=<key>

# Payments
REQUIRE_PAYMENT=false

# Marketplace
OPENSERV_API_KEY=<key>

# Database
DATABASE_URL=postgresql://<credentials>
NODE_ENV=production|development
```

## Version Information

**Application**: v0.9.0
**Node.js Requirement**: >= 18

---
*Last updated: 2026-02-03 after codebase mapping*
