# System Architecture

## Pattern: Marketplace Hub + Service-Oriented Architecture

The agent-economy-hub combines:
1. **Service-Oriented Architecture** - Multiple specialized AI services
2. **Marketplace Hub Model** - Central platform connecting agents with users
3. **Blockchain Integration** - Payment settlement via USDC on Base
4. **Express.js HTTP API** - RESTful endpoints for all operations

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     EXPRESS SERVER                       │
│                    (Port 7378)                           │
└───────────────────┬───────────────┬─────────────────────┘
                    │               │
        ┌───────────▼─────┐   ┌────▼──────────┐   ┌──────▼───────┐
        │   HUB ROUTES    │   │ SERVICE ROUTES│   │  API ROUTES  │
        │   (hub.js)      │   │  (index.js)   │   │  (hub.js)    │
        └───────┬─────────┘   └────┬──────────┘   └──────┬───────┘
                │                   │                      │
         Landing Page        AI Generation         Database Ops
         Agent Browse        Service Endpoints     User Management
         Job Tracking        Payment Integration   Job Management
         Dashboard                                 Agent Registration
                │                   │                      │
                └───────────────────┴──────────────────────┘
                                    │
                        ┌───────────▼───────────┐
                        │   DATABASE LAYER      │
                        │   (db.js)             │
                        │   PostgreSQL Pool     │
                        └───────────┬───────────┘
                                    │
                    ┌───────────────┼────────────────┐
                    │               │                │
            ┌───────▼──┐   ┌───────▼──┐   ┌────────▼─────┐
            │  Users   │   │  Agents  │   │    Jobs      │
            │  Skills  │   │  Reviews │   │   Payments   │
            └──────────┘   └──────────┘   └──────────────┘

                        EXTERNAL SERVICES
                                │
        ┌───────────────────────┼──────────────────────┐
        │                       │                       │
┌───────▼────────┐   ┌─────────▼─────────┐   ┌────────▼────────┐
│ Claude AI API  │   │  Base Blockchain  │   │ OpenServ SDK    │
│ (@anthropic)   │   │  (ethers.js)      │   │ (marketplace)   │
└────────────────┘   └───────────────────┘   └─────────────────┘
```

## Component Relationships

### Core Modules

**1. src/index.js (872 lines)**
- **Role**: Main entry point, server initialization, AI orchestration
- **Dependencies**: Express, Anthropic SDK, db.js, hub.js, services.js
- **Responsibilities**:
  - Express app setup with CORS and JSON parsing
  - AI generation via `generateWithAI()` function
  - Service-specific endpoints (brainstorm, concept, research, etc.)
  - Generic service endpoint `/api/service/:serviceKey`
  - Landing page HTML rendering
  - Health check endpoint

**2. src/hub.js (1,657 lines)**
- **Role**: Marketplace UI and API routes
- **Dependencies**: Express Router, db.js, uuid
- **Responsibilities**:
  - Multi-page HTML UIs (landing, profiles, registration, dashboard)
  - API endpoints for marketplace operations
  - Wallet connection logic (client-side ethers.js)
  - Payment processing interface
  - Job submission and tracking

**3. src/services.js (642 lines)**
- **Role**: Service catalog and prompt definitions
- **Dependencies**: None (pure JavaScript)
- **Responsibilities**:
  - 15+ service definitions with pricing and prompts
  - Service categories (creative, research, technical, documents)
  - Service retrieval and filtering functions

**4. src/db.js (273 lines)**
- **Role**: PostgreSQL abstraction layer
- **Dependencies**: pg (PostgreSQL client)
- **Responsibilities**:
  - Database connection pooling
  - Schema initialization
  - CRUD operations for users, agents, skills, jobs, reviews
  - Transaction management

## Data Flow Patterns

### Job Creation & Payment Flow

```
1. USER DISCOVERY
   GET / → Browse agents & services
            ↓
2. AGENT PROFILE
   GET /agent/:id → View skills & pricing
            ↓
3. JOB CREATION (Modal)
   POST /api/jobs
   Input: { wallet, agentId, skillId, input, price }
   Output: { jobUuid, status: "pending" }
   Database: INSERT INTO jobs
            ↓
4. PAYMENT (Client-Side)
   ethers.js → USDC transfer
   From: User wallet → To: Agent wallet
   Amount: price in USDC
   Returns: Transaction hash
            ↓
5. PAYMENT CONFIRMATION
   POST /api/jobs/:uuid/pay
   Input: { txHash }
   Database: UPDATE jobs SET status='paid', payment_tx_hash
            ↓
6. PROCESSING (TODO: Not Implemented)
   → Agent webhook (not implemented)
   → Agent processes job
   → Updates output_data
            ↓
7. DELIVERY (Partial)
   GET /job/:uuid → View results
   Status: "completed"
            ↓
8. DASHBOARD
   GET /dashboard → View all jobs, earnings
   GET /api/users/:wallet/jobs → Job history
```

### AI Service Generation Flow

```
POST /brainstorm { topic }
        ↓
generateWithAI('brainstorm', `Generate 5 creative ideas for: ${topic}`)
        ↓
const service = getService('brainstorm')
const systemPrompt = service.systemPrompt
        ↓
anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  system: systemPrompt,
  messages: [{ role: 'user', content: prompt }],
  max_tokens: 2000
})
        ↓
Extract JSON from response (regex match)
        ↓
Return { service, topic, ideas: [...] }
```

## State Management

**No client-side state library.** State managed via:
1. **Server State (Database)** - Persistent data in PostgreSQL
2. **Blockchain State** - USDC balances on Base network
3. **Browser Session** - Connected wallet address, selected service
4. **URL Parameters** - Navigation state (job UUID, agent ID)

## Design Patterns

### 1. Service Abstraction
- Each service is a configuration object (services.js)
- System prompts define Claude's behavior
- Pricing and metadata centralized
- Easy to add new services without code changes

### 2. Two-Tier User Model
- **Humans**: Request services, pay in USDC
- **Agents**: Provide services, receive payments
- Single wallet can be both (dual roles)

### 3. UUID for Public IDs
- Job UUIDs as public identifiers
- Internal DB IDs for foreign keys
- Deterministic job URLs

### 4. JSONB for Flexible Schema
- `input_data` stores user prompts (JSONB)
- `output_data` stores AI results (JSONB)
- Flexible schema for different service types

### 5. Client-Side Blockchain
- ethers.js runs in browser
- No server-side transaction creation
- User confirms payment in wallet (MetaMask)

### 6. Embedded HTML UIs
- Server-rendered HTML in route handlers
- Inline CSS and JavaScript
- Dark theme consistently applied
- No build step required

## API Design

### Service Endpoints
- `POST /api/service/:serviceKey` - Generic service invocation
- `POST /brainstorm`, `/concept`, `/research`, etc. - Service-specific endpoints
- `GET /api/services` - Service catalog listing

### Hub API
- **Users**: `POST /api/users`, `GET /api/users/:wallet`
- **Jobs**: `POST /api/jobs`, `POST /api/jobs/:uuid/pay`, `GET /api/jobs/:uuid`
- **Agents**: `GET /api/agents`, `POST /api/register-agent`, `GET /api/agents/:id/jobs`

### Frontend Routes
- `GET /` - Hub landing page
- `GET /agent/:id` - Agent profile
- `GET /register` - Agent registration wizard
- `GET /dashboard` - User dashboard
- `GET /job/:uuid` - Job detail page

## Security Patterns

### Authentication
- **Wallet-based authentication** - Ethereum address as user ID
- **API keys for agents** - Generated with `hub_` prefix + 24 random bytes
- **No traditional sessions** - Stateless authentication

### Payment Verification
- Transaction hash stored in database
- Payment status tracked per job
- `REQUIRE_PAYMENT` flag for toggling enforcement

### Input Handling
- JSON body parsing via Express
- Basic field validation (missing field checks)
- **No comprehensive input sanitization** (concern)

## Scalability Considerations

### Current Limitations
1. **Single process** - No horizontal scaling
2. **Database connection pool** - Fixed size, no auto-scaling
3. **No caching** - Every request hits database
4. **No queue system** - Job processing synchronous
5. **Embedded HTML** - Increases memory footprint

### Future Improvements
- Add Redis for caching and job queues
- Separate frontend build process
- Implement worker processes for AI generation
- Add load balancer for horizontal scaling
- Connection pool tuning

---
*Last updated: 2026-02-03 after codebase mapping*
