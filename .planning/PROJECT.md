# Agent Economy Hub

## Vision

A **crypto-native AI agent marketplace** where AI agents earn cryptocurrency for providing instant services to humans and other agents.

**Core Concept**: Pay-per-task AI services settled in USDC on Base blockchain. No Stripe bureaucracy, no middlemen—just wallet-to-wallet payments for instant AI work.

**Revenue Model**:
- 22 services ranging from $0.10 to $1.50 per job
- Platform fee: 0% initially (MrMagoochi keeps 100%)
- Future: 5-10% platform fee when other agents join

**Competitive Edge**:
- **Crypto-native**: USDC payments on Base L2 (low fees, instant settlement)
- **Agent-to-agent economy**: Agents can hire other agents, not just human→AI
- **Proven content library**: Built on 57 battle-tested Notion bot prompts
- **MCP-powered**: 180 tools (Replicate, Serper, Puppeteer, etc.) for rich services

**End Goal**: Public launch as a real marketplace where agents earn crypto for work.

---

## Current State

**Completion**: ~60% complete

### Technology Stack
- **Backend**: Node.js + Express.js
- **AI**: Claude Sonnet 4 (Anthropic)
- **Database**: PostgreSQL (users, agents, skills, jobs, reviews)
- **Blockchain**: Base network (Ethereum L2)
- **Payment**: USDC (ERC-20 stablecoin)
- **Wallet**: MetaMask + ethers.js v6
- **MCP Tools**: 180 tools including Replicate, Serper, Puppeteer

### Services Catalog (22 Services)
**Creative** (5): Brainstorm, Campaign Concepts, Copywriting, Creative Briefs, Social Strategy
**Research** (5): Research Reports, Competitive Analysis, Trend Analysis, Sentiment Analysis, Data Analysis
**Technical** (3): Code Review, API Integration Help, Web Scraping
**Documents** (3): Summarization, Document Generation, Report Creation
**Email** (1): Email Triage
**Visual** (5): Image generation services (text-to-image, style transfer, etc.)

---

## Requirements

### Validated ✓
*Existing functionality from brownfield codebase*

- ✓ **Hub UI** — Landing page with agent discovery, agent profiles, registration wizard, user dashboard
- ✓ **22 Service Definitions** — Service catalog with prompts, pricing, categories (services.js)
- ✓ **Database Schema** — PostgreSQL with users, agents, skills, jobs, reviews tables
- ✓ **Wallet Connection** — MetaMask integration, Base network detection, network switching
- ✓ **AI Backend** — Claude Sonnet 4 integration via Anthropic SDK, generateWithAI() function
- ✓ **Job Creation** — POST /api/jobs endpoint creates job with status "pending"
- ✓ **Payment UI** — USDC transfer interface with ethers.js, tx hash capture
- ✓ **API Structure** — RESTful endpoints for users, jobs, agents, services
- ✓ **Agent Registration** — Multi-step registration wizard with webhook URL, API key generation

### Active 🔨
*Features to complete for launch*

- [ ] **Payment → AI Processing Flow** — Wire POST /api/jobs/:uuid/pay to trigger AI generation immediately
  - Accept txHash, update job status to "paid"
  - Call generateWithAI() with job.input_data
  - Store result in job.output_data
  - Update status to "completed"
  - **Approach**: Direct processing (no queue), inline in pay endpoint
  - **Timeline**: 2-3 hours

- [ ] **Replicate Image Generation** — Integrate Replicate API for visual services
  - Server-side integration (keep API key secret)
  - Wire services with useReplicate: true flag
  - Call appropriate Replicate models (flux-schnell, stable-diffusion, etc.)
  - Store image URLs in output_data
  - Display images in job results
  - **Approach**: Server-side SDK, return URLs to frontend
  - **Timeline**: 1-2 hours

- [ ] **Agent Webhook System** — Notify agents when jobs are paid
  - POST to agent.webhook_url when job status changes to "paid"
  - Payload: { jobUuid, agentId, skillId, input, price }
  - Retry logic (3 attempts with exponential backoff)
  - Timeout handling (30s per attempt)
  - Enable other bots to offer services on platform
  - **Timeline**: 2 hours

- [ ] **Results Delivery & Display** — Rich result presentation
  - Job status updates (pending → paid → completed)
  - Email/notification when job completes (optional, post-launch)
  - Display formatted text results
  - Display images with proper rendering
  - Display structured data (JSON prettified)
  - Loading states while processing
  - **Timeline**: 2 hours

- [ ] **Polish & UX** — Production-ready experience
  - Mobile responsive layouts
  - Better error handling (validation, user-friendly messages)
  - Loading spinners and states
  - Empty states (no jobs yet, no results yet)
  - Success/error toasts or modals

- [ ] **Operational Basics** — Minimal production hardening
  - Rate limiting (express-rate-limit)
  - Input validation (Zod schemas or manual checks)
  - Environment variable validation
  - Basic logging (structured console output)

### Out of Scope
*Explicitly not in v1 unless time permits*

- ❌ **Advanced Payment Features** — Escrow, disputes, refunds, platform fee collection
- ❌ **Payout System** — Automated payouts to agents (direct wallet-to-wallet is sufficient)
- ❌ **Advanced Monitoring** — DataDog, Sentry, detailed analytics dashboards
- ❌ **Review/Rating System** — Schema exists but not enforced or displayed
- ❌ **Native Mobile Apps** — Web-only initially
- ❌ **Multi-language Support** — English only
- ❌ **Admin Dashboard** — Manual database access for moderation
- ❌ **Job History Export** — No CSV/PDF export functionality

---

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| **Payment → AI: Direct Processing** | Simpler than job queue, sufficient for initial volume. Inline processing in pay endpoint. | ✅ Adopted — Fast to ship, works for MrMagoochi, can add queue later if needed |
| **Image Gen: Server-Side Replicate** | Keeps API keys secure, standard pattern for API integration. | ✅ Adopted — Backend calls Replicate, returns URLs to frontend |
| **No Escrow for V1** | Direct wallet-to-wallet payments reduce complexity. Agent receives payment immediately. | ✅ Adopted — Trust-based initially, add escrow post-launch if needed |
| **Base Network Only** | Focus on single L2 with low fees. Don't support multi-chain initially. | ✅ Adopted — Base (chainId 8453) hardcoded, can expand later |
| **Minimize API Costs** | Watch Anthropic token usage, Replicate image costs, Alchemy RPC calls. Cache where possible. | ✅ Constraint — Optimize prompts, consider response caching, use efficient models |
| **All Features Critical** | Payment flow, image gen, webhooks, results all needed for compelling launch. | ✅ Adopted — Not shipping MVP subset, shipping complete v1 |

---

## Architecture Approach

### Data Flow: Payment → Processing → Delivery

```
1. USER SUBMITS JOB
   POST /api/jobs
   { wallet, agentId, skillId, input, price }
   → Creates job with status: "pending"
   → Returns jobUuid

2. USER PAYS WITH USDC
   ethers.js → USDC.transfer(agentWallet, amount)
   → Returns transaction hash

3. USER CONFIRMS PAYMENT
   POST /api/jobs/:uuid/pay
   { txHash }
   ├─ Update job: status="paid", payment_tx_hash
   ├─ Call generateWithAI(serviceKey, input)  ← NEW
   ├─ Store result in output_data              ← NEW
   ├─ Update status="completed"                ← NEW
   └─ Optionally: POST to agent webhook        ← NEW

4. USER VIEWS RESULTS
   GET /job/:uuid
   → Display output_data (text, images, structured data)
```

### Image Generation Flow

```
POST /api/service/image-gen
{ prompt, style, model }
   ↓
Check service.useReplicate === true
   ↓
Call Replicate API (server-side)
const prediction = await replicate.run(modelId, { input: { prompt } })
   ↓
Store image URLs in result
{ images: ['https://replicate.delivery/...'] }
   ↓
Return to frontend for display
```

### Webhook Invocation

```
Job status changes to "paid"
   ↓
Lookup agent.webhook_url
   ↓
POST https://agent-webhook.url/job
{
  jobUuid,
  agentId,
  skillId,
  input: { prompt: "..." },
  price: 0.50
}
   ↓
Agent receives notification
Agent processes job (their own logic)
Agent calls POST /api/jobs/:uuid/complete { output }
```

---

## Success Criteria

### Launch Readiness
- [ ] End-to-end flow works: User pays → AI generates → Result delivered
- [ ] At least 1 image generation service produces actual images
- [ ] Text services (brainstorm, research, write) return formatted results
- [ ] Mobile responsive (basic, not perfect)
- [ ] Error handling covers common cases (wallet not connected, payment failed, AI error)
- [ ] Demo video/screenshots ready to share

### Technical Milestones
- [ ] All dependencies installed (`npm install`)
- [ ] `.env` configured with real API keys (Anthropic, Replicate, Database)
- [ ] Database schema initialized and seeded with MrMagoochi agent
- [ ] Payment verification working (update job status on payment)
- [ ] AI processing integrated (Claude + Replicate)
- [ ] Results display working (text + images)
- [ ] Webhooks functional (can notify external agents)

### Operational Readiness
- [ ] Deployed to Railway with health checks
- [ ] Environment variables configured in Railway
- [ ] Database hosted (Railway PostgreSQL or external)
- [ ] Wallet configured with Base network USDC
- [ ] Rate limiting enabled
- [ ] Basic error logging

---

## Known Gaps & Technical Debt

### Critical (Blocking Launch)
1. **Payment Not Wired to AI** — `POST /api/jobs/:uuid/pay` updates status but doesn't process job
2. **Image Services Not Connected** — Replicate SDK not integrated
3. **No Results Display** — `output_data` rendered as raw JSON, not formatted
4. **Webhook System Missing** — Agent notification system not implemented

### High (Should Fix for Launch)
1. **No Payment Verification** — Trusts client-provided txHash without on-chain check
2. **Exposed Alchemy API Key** — Hardcoded in client-side JavaScript (hub.js:288)
3. **No Input Validation** — API endpoints accept any input without sanitization
4. **XSS Vulnerabilities** — User input rendered as HTML without escaping

### Medium (Post-Launch)
1. **No Testing** — Zero test coverage (unit, integration, e2e)
2. **No Logging** — Only console.log, no structured logging or monitoring
3. **No Rate Limiting** — Open to abuse, could rack up API costs
4. **Connection Pool Not Managed** — Database connections not gracefully closed

### Low (Technical Debt)
1. **HTML Embedded in Routes** — 1,657 lines in hub.js, hard to maintain
2. **Redundant Service Definitions** — Prompts defined in both index.js and services.js
3. **No API Documentation** — No OpenAPI/Swagger spec
4. **CORS Wide Open** — Accepts all origins

**Strategy**: Fix critical issues for launch, address high-severity post-launch, defer medium/low to future iterations.

---

## Constraints

### Budget
**Minimize API costs** across:
- **Anthropic Claude API** — ~$0.003 per 1K input tokens, ~$0.015 per 1K output tokens
  - Strategy: Optimize prompts, use max_tokens wisely, consider caching responses
- **Replicate API** — Varies by model (~$0.003-0.02 per image)
  - Strategy: Use faster models (flux-schnell), cache common requests if possible
- **Alchemy RPC** — Free tier: 300M compute units/month
  - Strategy: Move to backend to control usage, consider public RPC fallback

### Timeline
**Demo-ready ASAP** — User mentioned "4 hours tonight" for core work.
Priority: Ship working prototype over perfect production system.

### Technology
**Use existing MCP tools** — Leverage 180 tools (Replicate, Serper, Puppeteer) before adding new dependencies.

---

## Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| **Payment fraud** | Financial loss, reputation damage | Medium | Add on-chain tx verification post-launch |
| **API cost overrun** | Budget exceeded | Medium | Implement rate limiting, monitor usage dashboards |
| **AI generation failure** | Poor UX, refunds needed | Low | Add retry logic, fallback error messages |
| **Replicate API downtime** | Image services unavailable | Low | Cache results, show status page |
| **Wallet connection issues** | Users can't pay | Medium | Better error messages, MetaMask troubleshooting guide |
| **Agent webhook failures** | Jobs not processed | Low | Retry logic (3 attempts), timeout handling |

---

## Next Steps

After PROJECT.md approval:

1. **Create Roadmap** (`/gsd:create-roadmap`)
   - Phase 1: Complete payment → AI flow
   - Phase 2: Integrate Replicate image generation
   - Phase 3: Build webhook system
   - Phase 4: Results delivery & polish
   - Phase 5: Deploy to Railway

2. **Execute Phases** (`/gsd:plan-phase` → `/gsd:execute-plan`)
   - Write detailed execution plans
   - Implement with checkpoints
   - Verify each phase before moving forward

3. **Launch**
   - Deploy to production
   - Create demo video
   - Share with potential users

---

*Last updated: 2026-02-03 after project initialization*
