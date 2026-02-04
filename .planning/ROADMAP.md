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

## Phase 2: Payment Verification & Security ✅

**Goal**: Validate USDC transactions on-chain, secure exposed API keys

**Status**: ✅ **COMPLETE** (2026-02-03)

**Why second**: Security critical before processing real payments. Move Alchemy key to backend.

**Deliverables**: ✅ All delivered
- ✅ On-chain transaction verification (verifyUSDCPayment in blockchain.js)
- ✅ Payment amount validation (0.1% tolerance, 6 decimals)
- ✅ Alchemy key moved to backend (server-side .env only)
- ✅ Input validation on all API endpoints (wallet format, price, IDs)
- ✅ XSS prevention (HTML escaping + CSP header)
- ✅ SQL injection fix (field whitelist in updateJobStatus)

**Requires Research**: Partial (ethers.js transaction verification patterns)

**Estimated Complexity**: Medium (blockchain integration)

**Actual Time**: ~2 hours (5 commits)

**Files**:
- ✅ `src/blockchain.js` (created — 133 lines, transaction verification)
- ✅ `src/hub.js:1528-1596` (payment endpoint with verification)
- ✅ `src/hub.js:289` (removed exposed Alchemy key)
- ✅ `src/hub.js:1518-1533` (job creation with validation)
- ✅ `src/db.js:192-221` (SQL injection fix)
- ✅ `src/index.js` (CSP header + HTML sanitization)

**Plan**: `.planning/phases/02-payment-verification-security/02-01-PLAN.md`
**Summary**: `.planning/phases/02-payment-verification-security/02-01-SUMMARY.md`

---

## Phase 3: Payment → AI Processing Flow ✅

**Goal**: Wire payment endpoint to trigger immediate AI generation and store results

**Status**: ✅ **COMPLETE** (2026-02-03)

**Why third**: Core value proposition. Enables end-to-end flow for text services.

**Deliverables**: ✅ All delivered
- ✅ POST /api/jobs/:uuid/pay triggers generateWithAI()
- ✅ Extract serviceKey from job's skill_id (added service_key column)
- ✅ Call Claude with appropriate prompt and input
- ✅ Store result in job.output_data (JSONB)
- ✅ Update job status: paid → completed
- ✅ Error handling (AI failures, timeouts)
- ✅ Database schema updates (service_key column, 'failed' status)
- ✅ AI module extraction to avoid circular dependencies

**Requires Research**: No (architecture already defined)

**Estimated Complexity**: Medium (integration logic)

**Actual Time**: ~2 hours (5 commits)

**Files**:
- ✅ `src/ai.js` (created — 67 lines, AI generation module)
- ✅ `src/db.js` (getSkill() helper + schema updates)
- ✅ `src/hub.js:1567-1660` (pay endpoint with AI processing)
- ✅ `src/index.js` (updated imports)
- ✅ `src/services.js` (service definitions — no changes)

**Plan**: `.planning/phases/03-payment-ai-processing-flow/03-01-PLAN.md`
**Summary**: `.planning/phases/03-payment-ai-processing-flow/03-01-SUMMARY.md`

---

## Phase 4: Replicate Image Generation Integration ✅

**Goal**: Enable image generation services via Replicate API (server-side)

**Status**: ✅ **COMPLETE** (2026-02-03)

**Why fourth**: Adds visual services, differentiates marketplace. Builds on payment flow.

**Deliverables**: ✅ All delivered
- ✅ Installed and configured Replicate SDK (`replicate@1.4.0`)
- ✅ Created `src/replicate.js` service module (89 lines)
- ✅ Added 5 visual services with `useReplicate: true` flag
- ✅ Mapped service keys to Replicate model IDs (flux-schnell, sdxl, photomaker)
- ✅ Service routing (text → Claude, images → Replicate)
- ✅ Store image URLs in output_data
- ✅ Error handling for Replicate-specific errors
- ✅ Timeout protection (60s for images, 30s for text)

**Requires Research**: Yes (Replicate API patterns, model selection)

**Estimated Complexity**: Medium-High (new API integration)

**Actual Time**: ~1.5 hours (5 commits)

**Services Added**: 22 total (17 text + 5 image)
- image_generate ($0.50, flux-schnell)
- image_portrait ($0.75, photomaker)
- image_logo ($1.00, flux-schnell)
- image_product ($0.60, sdxl)
- image_style ($0.55, flux-schnell)

**Files**:
- ✅ `src/replicate.js` (created — 89 lines)
- ✅ `src/services.js` (added 5 visual services)
- ✅ `src/hub.js` (service type routing)
- ✅ `package.json` (added replicate dependency)

**Plan**: `.planning/phases/04-replicate-image-generation/04-01-PLAN.md`
**Summary**: `.planning/phases/04-replicate-image-generation/04-01-SUMMARY.md`

**Files**:
- Create `src/replicate.js` (new)
- `src/services.js` (add useReplicate flags, model mappings)
- `src/hub.js` or `src/index.js` (integrate into processing flow)
- `.env` (add REPLICATE_API_KEY)

---

## Phase 5: Results Display & Formatting ✅

**Goal**: Present AI-generated results (text, images, structured data) in rich UI

**Status**: ✅ **COMPLETE** (2026-02-03)

**Why fifth**: Completing the user experience loop. Show value of AI services.

**Deliverables**: ✅ All delivered
- ✅ Result formatting helper functions (formatJobResult, formatImageResult, formatTextResult)
- ✅ Format text results (ideas, findings, copywriting, summaries + JSON fallback)
- ✅ Display images with <img> tags and download links
- ✅ Loading states with status indicators (icons, descriptions)
- ✅ Auto-refresh for in-progress jobs (3s interval)
- ✅ Enhanced empty states with contextual messaging
- ✅ Dashboard job previews with result summaries
- ✅ HTML escaping for XSS prevention
- ✅ Error states with clear messages

**Requires Research**: No

**Estimated Complexity**: Low-Medium (frontend work)

**Actual Time**: ~30 minutes (6 commits)

**Files**:
- ✅ `src/hub.js` (formatters, job detail page, dashboard, XSS prevention)
- ✅ HUB_STYLES (result-list, result-item CSS)

**Plan**: `.planning/phases/05-results-display-formatting/05-01-PLAN.md`
**Summary**: `.planning/phases/05-results-display-formatting/05-01-SUMMARY.md`

---

## Phase 6: Agent Webhook System ✅

**Goal**: Notify external agents when jobs are paid via HTTP webhooks

**Status**: ✅ **COMPLETE** (2026-02-03)

**Why sixth**: Enables multi-agent marketplace. Critical for ecosystem growth.

**Deliverables**: ✅ All delivered
- ✅ Webhook delivery service with retry logic (src/webhooks.js)
- ✅ POST to agent.webhook_url when job status = 'paid'
- ✅ Payload: { jobUuid, agentId, skillId, serviceKey, input, price, paidAt }
- ✅ Retry logic (4 attempts: 0s, 1s, 2s, 4s exponential backoff)
- ✅ Timeout handling (30s per HTTP request)
- ✅ POST /api/jobs/:uuid/complete endpoint for agent callbacks
- ✅ API key authentication for agent responses
- ✅ Database tracking (webhook_deliveries table)
- ✅ In-progress status support
- ✅ Comprehensive documentation (docs/WEBHOOKS.md)
- ✅ Test script (scripts/test-webhook.js)
- ✅ Backward compatibility (agents without webhook_url still work via hub processing)

**Requires Research**: No (architecture defined)

**Estimated Complexity**: Medium (HTTP client, retry logic)

**Actual Time**: ~1 hour (6 commits)

**Files**:
- ✅ `src/webhooks.js` (created — 151 lines, webhook service)
- ✅ `src/hub.js` (webhook integration + completion endpoint)
- ✅ `src/db.js` (webhook_deliveries table + helpers)
- ✅ `docs/WEBHOOKS.md` (created — integration guide)
- ✅ `scripts/test-webhook.js` (created — test server)

**Plan**: `.planning/phases/06-agent-webhook-system/06-01-PLAN.md`
**Summary**: `.planning/phases/06-agent-webhook-system/06-01-SUMMARY.md`

---

## Phase 7: Input Validation & Error Handling ✅

**Goal**: Validate all user inputs, prevent injection attacks, improve error messages

**Status**: ✅ **COMPLETE** (2026-02-03)

**Why seventh**: Production hardening. Prevents bad data and security issues.

**Deliverables**: ✅ All delivered
- ✅ Comprehensive Zod schemas for all request types (src/validation.js)
- ✅ Validation middleware applied to all 11 API endpoints
- ✅ Database existence validators (agent, skill, user)
- ✅ Skill ownership and price validation
- ✅ User-friendly error messages with proper HTTP status codes
- ✅ Request body size limits (100KB default, 500KB for completions)
- ✅ Input sanitization (text normalization, webhook URL validation)
- ✅ Environment variable validation on startup
- ✅ HTTPS enforcement for webhooks, private IP blocking in production
- ✅ Global error handler middleware
- ✅ No breaking changes to existing API contracts

**Requires Research**: No

**Estimated Complexity**: Low-Medium (validation logic)

**Actual Time**: ~1 hour (6 commits)

**Files**:
- ✅ `src/validation.js` (created — 395 lines, Zod schemas + middleware)
- ✅ `src/hub.js` (validation integration + error handling)
- ✅ `src/index.js` (request size limits + env validation)

**Plan**: `.planning/phases/07-input-validation-error-handling/07-01-PLAN.md`
**Summary**: `.planning/phases/07-input-validation-error-handling/07-01-SUMMARY.md`

---

## Phase 8: Mobile Responsive & UI Polish ✅

**Goal**: Make UI mobile-friendly, add loading states, improve visual design

**Status**: ✅ **COMPLETE** (2026-02-03)

**Why eighth**: User experience matters for launch. Mobile users significant audience.

**Deliverables**: ✅ All delivered
- ✅ Mobile-responsive layouts with CSS media queries (320px-4K)
- ✅ Loading spinners for async operations (wallet, payment, AI)
- ✅ Toast notification system (success/error/info)
- ✅ Enhanced button states (hover, loading, success, disabled)
- ✅ Consistent typography system (h1-h6, responsive scaling)
- ✅ Spacing utilities (mb-1 to mb-5, gap utilities)
- ✅ Smooth transitions and animations (fade-in, slide-up, pulse)
- ✅ Hamburger menu for mobile navigation
- ✅ Touch-friendly targets (min 44x44px)
- ✅ Accessibility features (focus-visible, reduced-motion, skip-to-main)

**Requires Research**: No

**Estimated Complexity**: Low-Medium (CSS/frontend work)

**Actual Time**: ~1.5 hours (6 commits)

**Files**:
- ✅ `src/hub.js` (CSS: +850 lines, JS: +120 lines, HTML: mobile menu buttons)

**Plan**: `.planning/phases/08-mobile-responsive-ui-polish/08-01-PLAN.md`
**Summary**: `.planning/phases/08-mobile-responsive-ui-polish/08-01-SUMMARY.md`

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
| 6 | Agent Webhooks | Medium ✅ | No |
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
