# Production Monitoring Guide

Observability and monitoring recommendations for Agent Economy Hub in production.

## Overview

This guide covers what to monitor, how to monitor it, and when to act on alerts in production.

**Philosophy**: Monitor what matters. Don't drown in metrics. Focus on user experience and system health.

---

## Critical Metrics to Monitor

### 1. Application Health 🏥

**What to monitor:**
- `/health` endpoint returning 200 (service is running)
- `/ready` endpoint returning 200 (database connection works)
- No critical errors in logs
- Memory and CPU usage within normal range

**How to monitor:**
- **Railway Dashboard**: Memory/CPU graphs
- **Uptime monitoring**: UptimeRobot, Pingdom, Better Uptime
- **Log monitoring**: Winston logs via `railway logs`

**Alert when:**
- `/health` returns 503 for > 2 minutes
- Memory usage > 80% for > 10 minutes
- CPU usage > 90% for > 5 minutes
- Critical error rate > 5/minute

**How to fix:**
- Check `railway logs` for errors
- Check DATABASE_URL is valid
- Restart service if needed (Railway dashboard)
- Scale up if resource-constrained

---

### 2. Payment Flow Success Rate 💰

**What to monitor:**
- Payment verification success/failure rate
- Payment amount accuracy (< 0.1% tolerance)
- Average payment verification time
- Payment-related errors

**How to monitor:**
- Check Winston logs for "Payment verified" vs "Payment verification failed"
- Monitor `/api/stats` endpoint (tracks request counts)
- Review USDC balance in HUB_WALLET_ADDRESS

**Alert when:**
- Payment verification failure rate > 5%
- Payment verification time > 30 seconds
- No payments received for > 24 hours (might indicate issue)

**How to fix:**
- Check ALCHEMY_API_KEY is valid
- Check Base network RPC status (status.base.org)
- Check Alchemy dashboard for rate limits
- Verify HUB_WALLET_ADDRESS is correct

---

### 3. AI Generation Success Rate 🤖

**What to monitor:**
- Text generation success/failure rate
- Image generation success/failure rate
- Average generation time
- AI API errors (Anthropic, Replicate)

**How to monitor:**
- Check Winston logs for "AI generation complete" vs "AI generation failed"
- Monitor API response times in logs
- Track AI API costs (Anthropic dashboard, Replicate dashboard)

**Alert when:**
- AI generation failure rate > 10%
- Text generation time > 60 seconds
- Image generation time > 120 seconds
- API rate limit errors

**How to fix:**
- Check ANTHROPIC_API_KEY is valid and has credits
- Check REPLICATE_API_TOKEN is valid and has credits
- Review Anthropic usage dashboard for rate limits
- Review Replicate dashboard for queue times
- Consider adding more API credits if near limit

---

### 4. Rate Limiting & Abuse 🚦

**What to monitor:**
- Rate limit trigger frequency
- Repeated requests from same IP
- Unusual request patterns (bots, scrapers)
- High-volume endpoints

**How to monitor:**
- Check Winston logs for "rate limit exceeded"
- Review `/api/stats` endpoint (request counts by path)
- Monitor request patterns in Railway logs

**Alert when:**
- Rate limit triggers > 100/hour (might indicate attack)
- Single IP making > 1000 requests/hour
- Unusual traffic spike (10x normal volume)

**How to fix:**
- Review rate limits in `src/index.js` (adjust if needed)
- Consider adding IP-based blocking for abusers
- Add CAPTCHA if bot traffic becomes problematic
- Scale up if legitimate traffic increase

---

### 5. Database Performance 💾

**What to monitor:**
- Query response times
- Database connection pool usage
- Database size and growth rate
- Slow queries (> 1 second)

**How to monitor:**
- Railway dashboard → PostgreSQL metrics
- Winston logs for slow query warnings
- Check database size in Railway dashboard

**Alert when:**
- Query response time > 2 seconds average
- Database size approaching plan limit (Railway free: 1GB)
- Connection pool exhaustion errors

**How to fix:**
- Review slow queries in logs, add indexes if needed
- Check for N+1 query patterns
- Consider upgrading Railway plan if storage full
- Clean up old webhook_deliveries if needed

---

### 6. API Costs 💸

**What to monitor:**
- Anthropic API usage and costs
- Replicate API usage and costs
- Alchemy API requests and costs
- Railway hosting costs

**How to monitor:**
- **Anthropic**: console.anthropic.com/settings/usage
- **Replicate**: replicate.com/billing
- **Alchemy**: dashboard.alchemy.com/apps/[app-id]
- **Railway**: railway.app/project/[project-id]/metrics

**Alert when:**
- Anthropic costs > $50/day (adjust based on budget)
- Replicate costs > $30/day
- Alchemy requests approaching plan limit
- Railway costs > $20/month

**How to set alerts:**
- Anthropic: Set up billing alerts in console
- Replicate: Monitor billing page regularly
- Alchemy: Check usage dashboard weekly
- Railway: Enable cost notifications in settings

**How to fix:**
- Review usage patterns for abuse
- Adjust rate limits if needed
- Consider caching common requests (future)
- Upgrade API plans if legitimate usage

---

## Monitoring Tools Recommendations

### Essential (Free Tier)

#### 1. Railway Dashboard
**What it monitors:** Memory, CPU, deployments, logs
**Cost:** Free (included with Railway)
**Setup:** Already available
**Use for:** Quick health checks, log review

#### 2. Winston Logging
**What it monitors:** Application logs, errors, requests
**Cost:** Free
**Setup:** Already configured in `src/logger.js`
**Use for:** Debugging, error tracking, audit trail

**View logs:**
```bash
railway logs
```

**Filter logs:**
```bash
railway logs | grep ERROR
railway logs | grep "Payment verified"
railway logs | grep "rate limit exceeded"
```

#### 3. UptimeRobot (Free)
**What it monitors:** Uptime, response time
**Cost:** Free (up to 50 monitors)
**Setup:** 5 minutes
**Use for:** Get notified if site goes down

**Setup steps:**
1. Go to uptimerobot.com, create account
2. Add new monitor (HTTP)
3. URL: https://[project].railway.app/health
4. Check interval: 5 minutes
5. Alert contacts: Email
6. Save

#### 4. Browser DevTools
**What it monitors:** Client-side performance, errors
**Cost:** Free (built-in)
**Setup:** None
**Use for:** Frontend debugging, performance profiling

---

### Recommended (Paid)

#### 5. Sentry (Error Tracking)
**What it monitors:** JavaScript errors, exceptions
**Cost:** Free tier available, then $26/month
**Setup:** 10 minutes
**Use for:** Real-time error alerts, stack traces

**Setup steps:**
1. Sign up at sentry.io
2. Create new Node.js project
3. Install: `npm install @sentry/node`
4. Add to `src/index.js`:
```javascript
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN });
```
5. Add `SENTRY_DSN` to Railway env vars

#### 6. Datadog (APM)
**What it monitors:** Application performance, traces
**Cost:** Free trial, then $15/host/month
**Setup:** 15 minutes
**Use for:** Deep performance insights, request tracing

**When to use:** If you're seeing performance issues and need detailed insights

---

### Advanced (Optional)

#### 7. Prometheus + Grafana
**What it monitors:** Custom metrics, dashboards
**Cost:** Self-hosted (free), or managed ($$$)
**Setup:** 1-2 hours
**Use for:** Custom metrics, beautiful dashboards

**When to use:** If you outgrow basic monitoring and need custom metrics

#### 8. LogDNA / Papertrail
**What it monitors:** Log aggregation and search
**Cost:** $7-15/month
**Setup:** 10 minutes
**Use for:** Better log search than Railway dashboard

**When to use:** If Winston logs become hard to search in Railway dashboard

---

## Alert Configuration

### High Priority (Wake you up)

These should send SMS or push notifications:

- [ ] Site down (health check fails for > 5 minutes)
- [ ] Payment verification failure rate > 20%
- [ ] Critical error rate > 10/minute
- [ ] Memory usage > 95% (likely crash imminent)

**Where to send:**
- SMS (Twilio)
- Push (PagerDuty, Opsgenie)
- Email (as backup)

---

### Medium Priority (Email)

These can wait until you check email:

- [ ] Payment verification failure rate > 5%
- [ ] AI generation failure rate > 10%
- [ ] Rate limit triggers > 100/hour
- [ ] Slow queries (> 2 seconds)
- [ ] API costs > budget threshold

**Where to send:**
- Email
- Slack (if team)

---

### Low Priority (Check daily/weekly)

These are for review, not immediate action:

- [ ] Database size approaching limit
- [ ] Request volume trends
- [ ] API cost trends
- [ ] Popular services (usage analytics)

**Where to check:**
- Railway dashboard (daily)
- API dashboards (weekly)
- Winston logs (as needed)

---

## Monitoring Checklist

### Daily (5 minutes)
- [ ] Check Railway dashboard (any deployments failed?)
- [ ] Check UptimeRobot (any downtime?)
- [ ] Quick log review: `railway logs | tail -100`
- [ ] Check for critical errors: `railway logs | grep ERROR`

### Weekly (15 minutes)
- [ ] Review API usage (Anthropic, Replicate, Alchemy)
- [ ] Check API costs vs budget
- [ ] Review rate limit patterns
- [ ] Check database size and growth
- [ ] Review slow queries (if any)

### Monthly (30 minutes)
- [ ] Review total costs (Railway + APIs)
- [ ] Analyze usage trends (growing? stable?)
- [ ] Review TESTING-ISSUES.md for user-reported bugs
- [ ] Plan capacity scaling if needed
- [ ] Update monitoring if needed (new alerts, metrics)

---

## Key Metrics Dashboard

**Create a simple spreadsheet to track monthly:**

| Metric | This Month | Last Month | Change |
|--------|-----------|-----------|--------|
| Uptime % | 99.9% | - | - |
| Total Jobs | - | - | - |
| Payment Success Rate | - | - | - |
| AI Generation Success Rate | - | - | - |
| Anthropic Cost | $X | - | - |
| Replicate Cost | $X | - | - |
| Railway Cost | $X | - | - |
| Total Cost | $X | - | - |

**Pull data from:**
- Railway metrics
- API provider dashboards
- Winston logs (count "Payment verified", "AI generation complete")

---

## Incident Response Playbook

### If site is down (503 errors):

1. **Check Railway dashboard** → is service running?
2. **Check logs** → `railway logs | tail -100`
3. **Check health** → `curl https://[project].railway.app/health`
4. **Check database** → Railway dashboard → PostgreSQL status
5. **Restart if needed** → Railway dashboard → Restart
6. **If DB issue** → Check DATABASE_URL env var
7. **If persistent** → Rollback to previous deployment

---

### If payments failing:

1. **Check Alchemy status** → status.base.org
2. **Check API key** → `railway variables | grep ALCHEMY`
3. **Check recent logs** → `railway logs | grep "Payment verification"`
4. **Test manually** → Try small payment yourself
5. **If API issue** → Wait for Alchemy to recover
6. **If config issue** → Fix ALCHEMY_API_KEY or HUB_WALLET_ADDRESS

---

### If AI generation failing:

1. **Check Anthropic status** → status.anthropic.com
2. **Check API credits** → console.anthropic.com
3. **Check recent logs** → `railway logs | grep "AI generation"`
4. **Test manually** → Try job creation yourself
5. **If quota issue** → Add more credits
6. **If model issue** → Check Anthropic status page

---

### If high memory usage:

1. **Check Railway metrics** → Memory graph
2. **Check for memory leak** → Restart and monitor
3. **Check logs** → Look for error patterns
4. **Review recent deploys** → Did new code cause it?
5. **Scale up if needed** → Railway plan upgrade
6. **Fix leak if found** → Deploy patch

---

## Success Metrics

**Healthy system should show:**

✅ Uptime: > 99% (< 7 hours downtime/month)
✅ Payment success rate: > 95%
✅ AI generation success rate: > 90%
✅ Average response time: < 2 seconds
✅ Memory usage: < 70% average
✅ No critical errors: 0/day
✅ API costs: Within budget

**If any metric is outside healthy range, investigate and fix.**

---

## Additional Resources

- **Railway Docs**: docs.railway.app
- **Winston Logging**: github.com/winstonjs/winston
- **Uptime Monitoring**: uptimerobot.com
- **Sentry Docs**: docs.sentry.io
- **Anthropic Status**: status.anthropic.com
- **Base Network Status**: status.base.org

---

**Remember**: Monitor to stay informed, not to stress. Focus on metrics that impact users. 📊
