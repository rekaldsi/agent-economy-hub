# Launch Checklist

Comprehensive pre-launch verification for Agent Economy Hub.

## Pre-Launch Verification

### 1. Code Quality ✅

- [ ] All 12 phases complete (environment → testing)
- [ ] No TODO or FIXME comments in production code
- [ ] No console.log statements in production paths
- [ ] All API keys in .env (not hardcoded)
- [ ] .gitignore excludes .env and sensitive files

### 2. Security ✅

- [ ] Payment verification uses on-chain verification (Alchemy)
- [ ] API keys never exposed to frontend
- [ ] Input validation on all API endpoints (Zod schemas)
- [ ] SQL injection protection (parameterized queries)
- [ ] XSS prevention (HTML escaping + CSP headers)
- [ ] Rate limiting configured (5-200 req/min)
- [ ] CORS configured properly
- [ ] Environment variables validated on startup

### 3. Testing 🧪

**Manual Testing Required** - Follow TESTING.md:

- [ ] Execute all 21 test cases in TESTING.md
- [ ] Verify at least 90% pass rate
- [ ] Document failures in TESTING-ISSUES.md
- [ ] Fix critical bugs before launch
- [ ] Test on real mobile devices (iOS + Android)
- [ ] Test with real USDC transactions on Base network

**Critical Paths to Verify**:
- [ ] Landing page loads without errors
- [ ] Agent profile page shows all 22 skills
- [ ] Job creation flow works (create → payment page)
- [ ] Payment verification works (send USDC → verify transaction)
- [ ] AI generation works (text service returns results)
- [ ] Image generation works (Replicate returns image URL)
- [ ] Results display correctly (formatted, no XSS)
- [ ] Mobile responsive design works (hamburger menu, touch targets)
- [ ] Error handling shows user-friendly messages
- [ ] Rate limiting triggers on excessive requests

### 4. Database 💾

- [ ] PostgreSQL running (Railway or local)
- [ ] Database schema matches db.js functions
- [ ] npm run seed executed successfully
- [ ] MrMagoochi agent exists (ID: 1)
- [ ] 22 skills exist with correct service_key mapping
- [ ] Database backups configured (Railway automatic backups)

### 5. Deployment 🚀

- [ ] Railway project created
- [ ] PostgreSQL add-on attached
- [ ] Environment variables set (7 required + 3 optional)
- [ ] DATABASE_URL automatically configured
- [ ] ANTHROPIC_API_KEY set (starts with sk-ant-)
- [ ] ALCHEMY_API_KEY set (Base network RPC)
- [ ] REPLICATE_API_TOKEN set
- [ ] HUB_WALLET_ADDRESS set (USDC recipient)
- [ ] PORT set (default: 7378)
- [ ] NODE_ENV set to "production"
- [ ] LOG_LEVEL set to "info" or "warn"
- [ ] Health check endpoint configured (/health)
- [ ] Deployment successful (green status in Railway)
- [ ] npm run seed executed in production
- [ ] Logs show no errors (railway logs)

### 6. Functionality Verification 🔍

**After deployment to Railway:**

- [ ] Landing page loads: https://[project].railway.app/
- [ ] /health returns 200 OK
- [ ] /ready returns 200 OK (DB connection works)
- [ ] /api/stats returns metrics
- [ ] /agents shows MrMagoochi
- [ ] /agent/1 shows 22 skills
- [ ] MetaMask connects successfully
- [ ] Network switching works (any network → Base)
- [ ] Payment flow completes end-to-end
- [ ] AI results appear within 30 seconds
- [ ] Mobile responsive design verified

### 7. Performance ⚡

- [ ] Landing page loads in < 3 seconds
- [ ] Agent profile page loads in < 2 seconds
- [ ] Job creation API responds in < 500ms
- [ ] Payment verification completes in < 10 seconds
- [ ] Text generation completes in < 30 seconds
- [ ] Image generation completes in < 60 seconds
- [ ] No memory leaks (monitor Railway metrics)
- [ ] Database queries optimized (no N+1 queries)

### 8. Monitoring 📊

- [ ] Railway logs accessible (railway logs)
- [ ] Error logs reviewed (no critical errors)
- [ ] Winston logging operational (JSON format)
- [ ] /api/stats endpoint working
- [ ] Set up monitoring alerts (optional but recommended)
  - Railway: Enable "Email on Deploy" notifications
  - Railway: Monitor memory/CPU usage
  - Set up uptime monitoring (UptimeRobot, Pingdom, etc.)

### 9. Documentation 📝

- [ ] README.md complete and accurate
- [ ] RAILWAY.md deployment guide complete
- [ ] TESTING.md test cases documented
- [ ] KNOWN-ISSUES.md limitations documented
- [ ] .env.example has all variables with descriptions
- [ ] API endpoints documented in README
- [ ] Architecture documented in README

### 10. Marketing Materials 📣

- [ ] Demo video recorded (2-3 minutes)
- [ ] Screenshots taken (landing, agents, payment, results)
- [ ] Launch announcement drafted
- [ ] Social media posts prepared
- [ ] Forum posts prepared (Reddit, Farcaster)
- [ ] Product Hunt submission prepared (optional)

---

## Launch Decision

**Go/No-Go Criteria**:

✅ **GO if**:
- All security checks pass (100%)
- All database checks pass (100%)
- All deployment checks pass (100%)
- Manual testing shows ≥90% pass rate
- Critical paths verified (payment flow, AI generation)
- Performance acceptable (< 3s page loads)
- No critical bugs in TESTING-ISSUES.md

⚠️ **HOLD if**:
- Critical security vulnerability found
- Payment verification failing
- AI generation failing
- < 90% test pass rate
- Critical bugs not fixed

---

## Post-Launch Monitoring

**First 24 Hours**:
- [ ] Monitor Railway logs every 2-4 hours
- [ ] Check /api/stats for request patterns
- [ ] Verify no error spikes in logs
- [ ] Monitor memory/CPU usage in Railway dashboard
- [ ] Test payment flow with small amounts
- [ ] Respond to user feedback quickly

**First Week**:
- [ ] Daily log review
- [ ] Monitor user feedback (Twitter, Reddit)
- [ ] Track payment volume and success rate
- [ ] Monitor AI API costs (Anthropic, Replicate)
- [ ] Check for rate limit hits (adjust if needed)
- [ ] Verify database backups running

**Ongoing**:
- [ ] Weekly log review
- [ ] Monthly cost review (Railway, Anthropic, Replicate, Alchemy)
- [ ] Monitor for abuse/spam patterns
- [ ] Update known issues based on user reports
- [ ] Plan v2.0 features based on feedback

---

## Emergency Contacts

**If something breaks in production:**

1. **Check logs**: `railway logs` or Railway dashboard
2. **Check health**: https://[project].railway.app/health
3. **Check database**: Railway dashboard → PostgreSQL metrics
4. **Rollback**: Railway dashboard → Deployments → Rollback to previous
5. **Emergency stop**: Railway dashboard → Pause service

**Common Issues**:
- 503 errors → Check DATABASE_URL, verify DB running
- Payment verification failing → Check ALCHEMY_API_KEY, Base network RPC
- AI generation failing → Check ANTHROPIC_API_KEY credits
- Image generation failing → Check REPLICATE_API_TOKEN credits
- High memory usage → Check for memory leaks, restart service
- Rate limit triggering → Adjust limits in src/index.js

---

**Ready to launch?** Check off all items above, then publish your announcement! 🚀
