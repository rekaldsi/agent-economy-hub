# Directory & File Structure

## Project Root

```
agent-economy-hub/
├── src/
│   ├── index.js        (872 lines)  Main server, AI generation, service routes
│   ├── hub.js          (1,657 lines) Marketplace UI & API routes
│   ├── services.js     (642 lines)  Service catalog & prompts
│   └── db.js           (273 lines)  Database layer & schema
├── package.json        NPM dependencies & scripts
├── package-lock.json   Dependency lock file
├── railway.json        Railway deployment config
├── .env.example        Environment variable template
├── .gitignore          Git ignore rules
└── README.md           Project documentation
```

## Module Organization

### src/index.js (Main Entry Point)
**Lines: 872**

**Structure**:
```
Lines 1-30     | Imports & initialization (Express, Anthropic, CORS, dotenv)
Lines 31-135   | Legacy service prompts (redundant with services.js)
Lines 140-168  | generateWithAI() - Core AI generation function
Lines 170-793  | Service-specific route handlers (/brainstorm, /concept, etc.)
Lines 795-847  | Generic service endpoint (/api/service/:serviceKey)
Lines 849-855  | Health check & 404 handler
Lines 857-871  | Server startup (initDB + listen)
```

**Key Functions**:
- `generateWithAI(serviceKey, userMessage)` - Calls Claude API, extracts JSON
- Service route handlers (brainstorm, concept, research, write, brief, etc.)

**Route Prefix**: `/` (root level)
**Module Exports**: None (entry point)

---

### src/hub.js (Marketplace Hub)
**Lines: 1,657**

**Structure**:
```
Lines 1-10       | Imports (Express Router, uuid, db)
Lines 12-103     | HUB_STYLES - Shared CSS for all pages
Lines 105-862    | HUB_SCRIPTS - Client-side JS (wallet, payment, job submission)
Lines 864-1074   | GET / - Hub landing page HTML
Lines 1076-1227  | GET /agent/:id - Agent profile page HTML
Lines 1229-1442  | GET /dashboard - User dashboard HTML
Lines 1444-1477  | GET /job/:uuid - Job detail page HTML
Lines 1479-1502  | POST /api/users - Create/get user
Lines 1504-1542  | POST /api/jobs - Create job request
Lines 1544-1562  | POST /api/jobs/:uuid/pay - Update payment
Lines 1564-1575  | GET /api/jobs/:uuid - Get job details
Lines 1577-1594  | GET /api/agents - List all agents
Lines 1596-1644  | POST /api/register-agent - Register new agent
Lines 1646-1657  | GET /api/agents/:id/jobs - Get agent's jobs
```

**Key Routes**:
- **Frontend Pages**: `/`, `/agent/:id`, `/register`, `/dashboard`, `/job/:uuid`
- **API Endpoints**: `/api/users`, `/api/jobs`, `/api/agents`, `/api/register-agent`

**Module Pattern**: Express Router exported as `module.exports`
**Mounted At**: `/` (in index.js)

---

### src/services.js (Service Catalog)
**Lines: 642**

**Structure**:
```
Lines 1-9      | File header & service structure documentation
Lines 11-609   | SERVICES object - 15+ service definitions
Lines 611-615  | getService(key) - Retrieve by key
Lines 617-621  | getAllServices() - Return all as array
Lines 623-629  | getServicesByCategory(cat) - Filter by category
Lines 631-636  | getCategories() - List unique categories
Lines 638-642  | Module exports
```

**Service Categories**:
- `creative` - brainstorm, concept, write, brief, social_strategy
- `research` - research, competitive, trends, sentiment, data_analysis
- `technical` - code_review, api_help, scrape
- `documents` - summarize, document, report
- `email` - email_triage

**Service Schema**:
```javascript
{
  name: "Display Name",
  category: "category_key",
  description: "Brief description",
  price: 0.50,              // USDC
  estimatedTime: "1 minute",
  inputLabel: "UI label",
  inputPlaceholder: "Example",
  systemPrompt: "Claude prompt..."
}
```

**Module Pattern**: Pure JavaScript object with helper functions
**No External Dependencies**

---

### src/db.js (Database Layer)
**Lines: 273**

**Structure**:
```
Lines 1-6      | PostgreSQL connection pool setup
Lines 8-98     | initDB() - Schema initialization (CREATE TABLE IF NOT EXISTS)
Lines 100-109  | query() helper - Raw SQL execution
Lines 111-120  | getUser(walletAddress)
Lines 122-143  | createUser(wallet, type, name, avatarUrl, bio)
Lines 145-163  | getAgent(agentId) - Get agent by ID
Lines 165-174  | getAgentByWallet(wallet) - Get agent by wallet address
Lines 176-186  | getAllAgents() - List all active agents
Lines 188-218  | createAgent(userId, webhookUrl) - Register agent with API key
Lines 220-236  | createSkill(agentId, name, desc, cat, price, time) - Add service
Lines 238-245  | getSkillsByAgent(agentId) - List agent's skills
Lines 247-266  | createJob(uuid, requesterId, agentId, skillId, input, price)
Lines 268-273  | updateJobStatus(jobId, status, extraFields) - Update job
Lines 275-280  | getJob(jobUuid)
Lines 282-289  | getJobsByUser(userId)
Lines 291-298  | getJobsByAgent(agentId)
```

**Database Schema (5 Tables)**:
```sql
users       (id, wallet_address, user_type, name, avatar_url, bio, created_at, updated_at)
agents      (id, user_id, webhook_url, api_key, is_active, total_jobs, total_earned, rating, created_at)
skills      (id, agent_id, name, description, category, price_usdc, estimated_time, is_active, created_at)
jobs        (id, job_uuid, requester_id, agent_id, skill_id, status, input_data, output_data,
             price_usdc, payment_tx_hash, payout_tx_hash, created_at, paid_at, delivered_at, completed_at)
reviews     (id, job_id, reviewer_id, rating, comment, created_at)
```

**Indexes**:
- `users.wallet_address` (UNIQUE)
- `agents.api_key` (UNIQUE)
- `skills.agent_id`, `skills.category`
- `jobs.requester_id`, `jobs.agent_id`, `jobs.status`

**Module Pattern**: Exports connection pool and query functions

---

## File Naming Conventions

| Pattern | Example | Usage |
|---------|---------|-------|
| **camelCase** | `index.js`, `hub.js`, `services.js`, `db.js` | All source files |
| **lowercase** | `package.json`, `railway.json` | Config files |
| **UPPERCASE** | `README.md` | Documentation |
| **dotfiles** | `.env.example`, `.gitignore` | Hidden configs |

---

## Module Boundaries & Responsibilities

### Clear Separation of Concerns

```
index.js
  ├─ Server lifecycle (start, listen, shutdown)
  ├─ AI integration (Anthropic SDK)
  ├─ Service orchestration
  └─ Route registration

hub.js
  ├─ UI rendering (HTML generation)
  ├─ Marketplace API routes
  ├─ Client-side wallet logic
  └─ Job management

services.js
  ├─ Service definitions (pure data)
  ├─ Pricing configuration
  ├─ Prompt engineering
  └─ Service discovery utilities

db.js
  ├─ Database connection management
  ├─ Schema initialization
  ├─ Query abstraction
  └─ CRUD operations
```

### Cross-Module Dependencies

```
index.js
  └─> db.js (initDB, database operations)
  └─> hub.js (router mounting)
  └─> services.js (service definitions)
  └─> @anthropic-ai/sdk

hub.js
  └─> db.js (all database operations)
  └─> uuid (job ID generation)

services.js
  (no external dependencies)

db.js
  └─> pg (PostgreSQL client)
```

---

## Entry Points

**Primary Entry**: `src/index.js`
- NPM script: `npm start` → `node src/index.js`
- Railway start command: `node src/index.js`

**Startup Flow**:
```
1. Load environment (.env)
2. Initialize Express app
3. Apply middleware (CORS, JSON parser)
4. Initialize database schema (db.initDB())
5. Mount hub routes (app.use('/', hubRouter))
6. Register service routes
7. Start HTTP server (port 7378)
```

---

## Configuration Files

### package.json
- **Dependencies**: 11 production packages
- **Scripts**: `start` only
- **Engine**: Node.js >= 18
- **Version**: Not specified (should add)

### railway.json
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node src/index.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### .env.example
```bash
PORT=7378
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
OPENSERV_API_KEY=...
WALLET_ADDRESS=0x...
WALLET_PRIVATE_KEY=...
REQUIRE_PAYMENT=false
NODE_ENV=development
```

---

## Code Organization Patterns

### HTML Embedded in Routes
- All UI pages defined as template literals in route handlers
- Shared CSS defined as `HUB_STYLES` constant
- Shared JavaScript defined as `HUB_SCRIPTS` constant
- Inline styling with CSS variables (`:root` design tokens)

**Example**:
```javascript
router.get('/', async (req, res) => {
  const agents = await db.getAllAgents();
  const html = `
    <!DOCTYPE html>
    <html>
      <head><style>${HUB_STYLES}</style></head>
      <body>
        <!-- HTML content with ${interpolation} -->
        <script>${HUB_SCRIPTS}</script>
      </body>
    </html>
  `;
  res.send(html);
});
```

### No Build Process
- No Webpack, Vite, or bundler
- No TypeScript compilation
- No CSS preprocessor
- Direct Node.js execution

**Benefits**:
- Fast deployment
- Minimal complexity
- No build artifacts

**Tradeoffs**:
- No code splitting
- No tree shaking
- Large file sizes (1,657 lines in hub.js)
- Harder to maintain complex UIs

---

## Future Structure Recommendations

If scaling or maintaining long-term, consider:

```
agent-economy-hub/
├── src/
│   ├── server/
│   │   ├── index.js
│   │   ├── routes/
│   │   │   ├── hub.routes.js
│   │   │   ├── service.routes.js
│   │   │   └── api.routes.js
│   │   ├── services/
│   │   │   ├── ai.service.js
│   │   │   ├── payment.service.js
│   │   │   └── job.service.js
│   │   └── middleware/
│   │       ├── auth.js
│   │       ├── validation.js
│   │       └── error.js
│   ├── database/
│   │   ├── connection.js
│   │   ├── schema.sql
│   │   └── queries/
│   └── config/
│       └── services.json
├── public/
│   ├── css/
│   ├── js/
│   └── assets/
└── views/
    ├── landing.ejs
    ├── agent-profile.ejs
    └── dashboard.ejs
```

---
*Last updated: 2026-02-03 after codebase mapping*
