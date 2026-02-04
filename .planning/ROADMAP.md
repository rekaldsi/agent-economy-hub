# Agent Economy Hub — Roadmap

**Project**: Crypto-native AI agent marketplace
**Goal**: Public launch with end-to-end payment flow, image generation, and multi-agent support
**Planning Depth**: Comprehensive
**Mode**: YOLO (auto-execute)

---

## Milestone 1: Launch v1.0

**Goal**: Ship functioning marketplace where users pay USDC → receive AI-generated results

**Target**: Demo-ready prototype with all critical features working

---

## Phase 1: Environment Setup & Dependencies ✅

**Goal**: Install dependencies, configure environment, verify database connection

**Status**: ✅ **COMPLETE** (2026-02-03)

**Why first**: Can't run or test anything without proper setup. Unblocks all development work.

**Deliverables**: ✅ All delivered
- ✅ All npm packages installed and working (197 packages)
- ✅ `.env` file configured with real API keys
- ✅ Database connection verified (PostgreSQL 17.7 on Railway)
- ✅ Server starts without errors
- ✅ MrMagoochi agent seeded in database (was already seeded)

**Requires Research**: No

**Estimated Complexity**: Low (setup/configuration)

**Actual Time**: 15 minutes

**Files**:
- `package.json` (verify deps)
- `.env` (create from .env.example)
- `src/db.js` (test connection)
- `src/index.js` (verify server start)

**Plan**: `.planning/phases/01-environment-setup/01-01-PLAN.md`
**Summary**: `.planning/phases/01-environment-setup/01-01-SUMMARY.md`

---

## Phase 2: Payment Verification & Security

**Goal**: Validate USDC transactions on-chain, secure exposed API keys

**Why second**: Security critical before processing real payments. Move Alchemy key to backend.

**Deliverables**:
- On-chain transaction verification (check txHash actually occurred)
- Validate payment amount matches job price
- Move Alchemy RPC calls to backend (hide API key)
- Input validation on all API endpoints
- XSS prevention (sanitize HTML outputs)

**Requires Research**: Partial (ethers.js transaction verification patterns)

**Estimated Complexity**: Medium (blockchain integration)

**Files**:
- `src/hub.js:1544-1562` (POST /api/jobs/:uuid/pay)
- `src/hub.js:288` (exposed Alchemy key)
- Create `src/blockchain.js` (new backend service)
- `src/hub.js` (sanitize HTML outputs)

---

## Phase 3: Payment → AI Processing Flow

**Goal**: Wire payment endpoint to trigger immediate AI generation and store results

**Why third**: Core value proposition. Enables end-to-end flow for text services.

**Deliverables**:
- POST /api/jobs/:uuid/pay triggers generateWithAI()
- Extract serviceKey from job's skill_id
- Call Claude with appropriate prompt and input
- Store result in job.output_data (JSONB)
- Update job status: paid → completed
- Error handling (AI failures, timeouts)

**Requires Research**: No (architecture already defined)

**Estimated Complexity**: Medium (integration logic)

**Files**:
- `src/hub.js:1544-1562` (pay endpoint)
- `src/index.js:140-168` (generateWithAI function)
- `src/db.js` (add getSkill() helper)
- `src/services.js` (service definitions)

---

## Phase 4: Replicate Image Generation Integration

**Goal**: Enable image generation services via Replicate API (server-side)

**Why fourth**: Adds visual services, differentiates marketplace. Builds on payment flow.

**Deliverables**:
- Install and configure Replicate SDK (`npm install replicate`)
- Create `src/replicate.js` service module
- Wire services with `useReplicate: true` flag
- Map service keys to Replicate model IDs (flux-schnell, stable-diffusion, etc.)
- Call appropriate models with user prompts
- Store image URLs in output_data
- Handle Replicate-specific errors (rate limits, model unavailable)

**Requires Research**: Yes (Replicate API patterns, model selection)

**Estimated Complexity**: Medium-High (new API integration)

**Files**:
- Create `src/replicate.js` (new)
- `src/services.js` (add useReplicate flags, model mappings)
- `src/hub.js` or `src/index.js` (integrate into processing flow)
- `.env` (add REPLICATE_API_KEY)

---

## Phase 5: Results Display & Formatting

**Goal**: Present AI-generated results (text, images, structured data) in rich UI

**Why fifth**: Completing the user experience loop. Show value of AI services.

**Deliverables**:
- Format text results (preserve formatting, code blocks, markdown)
- Display images with proper rendering (<img> tags, lightbox optional)
- Pretty-print JSON for structured data
- Loading states while job processes (pending → paid → completed)
- Empty states (no results yet, job failed)
- Error messages for failures

**Requires Research**: No

**Estimated Complexity**: Low-Medium (frontend work)

**Files**:
- `src/hub.js:1444-1477` (GET /job/:uuid page)
- `src/hub.js:1315` (dashboard job list)
- `src/hub.js:1393-1399` (result display)
- Add CSS for image galleries, formatted text

---

## Phase 6: Agent Webhook System

**Goal**: Notify external agents when jobs are paid via HTTP webhooks

**Why sixth**: Enables multi-agent marketplace. Critical for ecosystem growth.

**Deliverables**:
- POST to agent.webhook_url when job status changes to "paid"
- Payload: { jobUuid, agentId, skillId, input, price }
- Retry logic (3 attempts with exponential backoff: 1s, 2s, 4s)
- Timeout handling (30s per HTTP request)
- Dead letter queue (optional: log failed webhooks)
- Create POST /api/jobs/:uuid/complete endpoint for agent responses

**Requires Research**: No (architecture defined)

**Estimated Complexity**: Medium (HTTP client, retry logic)

**Files**:
- `src/hub.js:1544-1562` (call webhook after payment)
- Create `src/webhooks.js` (new service)
- `src/hub.js` (add POST /api/jobs/:uuid/complete endpoint)
- `src/db.js` (track webhook attempts)

---

## Phase 7: Input Validation & Error Handling

**Goal**: Validate all user inputs, prevent injection attacks, improve error messages

**Why seventh**: Production hardening. Prevents bad data and security issues.

**Deliverables**:
- Validate wallet addresses (Ethereum address format)
- Validate job prices (positive numbers, match skill price)
- Validate agent/skill IDs (exist in database)
- SQL injection prevention (whitelist fields in updateJobStatus)
- Better error messages for users (not implementation details)
- Validation middleware using Zod schemas (optional) or manual checks

**Requires Research**: No

**Estimated Complexity**: Low-Medium (validation logic)

**Files**:
- `src/hub.js:1504-1542` (POST /api/jobs)
- `src/db.js:192-208` (updateJobStatus SQL injection)
- All API endpoints in `src/hub.js`
- Consider creating `src/validation.js` middleware

---

## Phase 8: Mobile Responsive & UI Polish

**Goal**: Make UI mobile-friendly, add loading states, improve visual design

**Why eighth**: User experience matters for launch. Mobile users significant audience.

**Deliverables**:
- Mobile-responsive layouts (CSS media queries)
- Loading spinners for async operations (wallet connect, payment, AI generation)
- Success/error toast notifications or modals
- Empty states with helpful messages
- Better button states (disabled while loading)
- Consistent spacing and typography

**Requires Research**: No

**Estimated Complexity**: Low-Medium (CSS/frontend work)

**Files**:
- `src/hub.js:12-103` (HUB_STYLES)
- `src/hub.js:105-862` (HUB_SCRIPTS)
- All HTML pages in `src/hub.js`

---

## Phase 9: Rate Limiting & Basic Ops

**Goal**: Prevent API abuse, add basic operational safeguards

**Why ninth**: Cost control before launch. Prevent runaway API costs.

**Deliverables**:
- Install express-rate-limit
- Rate limit API endpoints (10 req/min per IP for job creation)
- Rate limit AI generation (5 req/min per wallet)
- Environment variable validation on startup
- Structured logging (Winston or console with JSON format)
- Graceful shutdown (close DB pool, finish in-flight requests)

**Requires Research**: No

**Estimated Complexity**: Low (middleware configuration)

**Files**:
- `src/index.js` (add rate limit middleware)
- `src/db.js` (graceful shutdown)
- Create `src/logger.js` (optional structured logging)

---

## Phase 10: Database Seeding & Initial Data

**Goal**: Seed database with MrMagoochi agent and initial skills

**Why tenth**: Need agent in system for testing and launch. Reference implementation.

**Deliverables**:
- Create seed script (`npm run seed` or `node scripts/seed.js`)
- Create MrMagoochi user (type: 'agent')
- Create MrMagoochi agent profile (webhook_url, api_key)
- Create all 22 skills from services.js
- Script should be idempotent (safe to run multiple times)

**Requires Research**: No

**Estimated Complexity**: Low (database script)

**Files**:
- Create `scripts/seed.js` (new)
- `src/services.js` (read service definitions)
- `src/db.js` (use existing functions)
- `package.json` (add seed script)

---

## Phase 11: Railway Deployment Configuration

**Goal**: Prepare for Railway deployment, configure production environment

**Why eleventh**: Production deployment setup. Ensure app runs in Railway environment.

**Deliverables**:
- Verify railway.json configuration
- Set environment variables in Railway dashboard
- Configure Railway PostgreSQL (or external DB)
- Test health check endpoint
- Configure restart policy
- Set up production logging
- Test deployment to staging environment (if available)

**Requires Research**: Partial (Railway-specific configuration)

**Estimated Complexity**: Low-Medium (DevOps)

**Files**:
- `railway.json` (verify/update)
- `.env.example` (document all required vars)
- `src/index.js` (health check endpoint)
- Railway dashboard (environment config)

---

## Phase 12: End-to-End Testing & Verification

**Goal**: Manually test complete user journeys, fix critical bugs

**Why twelfth**: Quality assurance before public launch. Verify everything works together.

**Deliverables**:
- Test text service flow (brainstorm, research, write)
- Test image generation service flow
- Test agent registration flow
- Test wallet connection (MetaMask)
- Test network switching (non-Base → Base)
- Test error cases (insufficient USDC, AI failure, webhook failure)
- Test mobile responsive design on real devices
- Document known issues and workarounds

**Requires Research**: No

**Estimated Complexity**: Medium (comprehensive testing)

**Files**:
- All application files (end-to-end testing)
- Create `TESTING.md` (document test cases)

---

## Phase 13: Launch Preparation & Documentation

**Goal**: Final polish, create demo materials, prepare for public launch

**Why last**: Marketing and communication before going live.

**Deliverables**:
- Record demo video (2-3 minutes)
- Take screenshots for landing page
- Write README.md with setup instructions
- Create public-facing landing page copy
- Prepare launch announcement (Twitter, forums, etc.)
- Set up monitoring/alerts (optional but recommended)
- Launch checklist verification

**Requires Research**: No

**Estimated Complexity**: Low (documentation/marketing)

**Files**:
- `README.md` (update)
- Create demo materials (video, screenshots)
- `src/hub.js:864-1074` (landing page copy)

---

## Summary

| Phase | Focus | Complexity | Research? |
|-------|-------|-----------|-----------|
| 1 | Environment Setup | Low | No |
| 2 | Payment Security | Medium | Partial |
| 3 | Payment → AI Flow | Medium | No |
| 4 | Replicate Images | Medium-High | Yes |
| 5 | Results Display | Low-Medium | No |
| 6 | Agent Webhooks | Medium | No |
| 7 | Input Validation | Low-Medium | No |
| 8 | Mobile & Polish | Low-Medium | No |
| 9 | Rate Limiting | Low | No |
| 10 | Database Seeding | Low | No |
| 11 | Railway Deploy | Low-Medium | Partial |
| 12 | E2E Testing | Medium | No |
| 13 | Launch Prep | Low | No |

**Total Phases**: 13
**Critical Path**: 1 → 2 → 3 → 4 → 5 → 12 → 13
**Estimated Total Time**: 15-20 hours (comprehensive scope)

---

## Dependencies

```
Phase 1 (Setup)
  └─> Phase 2 (Security)
       └─> Phase 3 (Payment→AI)
            ├─> Phase 4 (Replicate)
            └─> Phase 6 (Webhooks)
                 └─> Phase 5 (Results Display)
                      └─> Phase 7 (Validation)
                           └─> Phase 8 (Mobile)
                                └─> Phase 9 (Rate Limits)
                                     └─> Phase 10 (Seeding)
                                          └─> Phase 11 (Railway)
                                               └─> Phase 12 (Testing)
                                                    └─> Phase 13 (Launch)
```

---

*Last updated: 2026-02-03 after roadmap creation*
