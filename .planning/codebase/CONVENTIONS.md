# Code Conventions & Style Guide

## Naming Conventions

### File Naming
| Pattern | Examples | Usage |
|---------|----------|-------|
| **camelCase** | `index.js`, `hub.js`, `services.js`, `db.js` | All JavaScript source files |
| **lowercase** | `package.json`, `railway.json` | Configuration files |
| **UPPERCASE** | `README.md` | Documentation files |
| **dotfiles** | `.env.example`, `.gitignore` | Environment/config |

### Function Naming

**Verb-first pattern for actions**:
```javascript
// Database operations
async function getUser(walletAddress)
async function createAgent(userId, webhookUrl)
async function updateJobStatus(jobId, status)

// Service functions
async function generateWithAI(serviceKey, userMessage)
function getAllServices()
function getServicesByCategory(category)

// UI actions (client-side)
async function connectWallet()
async function submitJob()
function updatePrice()
```

**Consistent CRUD prefixes**:
- `get*` - Retrieve data (read)
- `create*` - Insert new records
- `update*` - Modify existing records
- `delete*` - Remove records (not yet used)

### Variable Naming

| Pattern | Examples | Usage |
|---------|---------|-------|
| **camelCase** | `userMessage`, `serviceKey`, `jobUuid` | Local variables, parameters |
| **UPPERCASE_SNAKE_CASE** | `ANTHROPIC_API_KEY`, `PORT`, `USDC_ADDRESS` | Constants, env vars |
| **snake_case** | `wallet_address`, `user_type`, `price_usdc` | Database column names |
| **Boolean prefixes** | `isActive`, `connected`, `is_active` | Boolean flags |

**Examples**:
```javascript
// Constants
const PORT = process.env.PORT || 7378;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Variables
const walletAddress = req.params.wallet.toLowerCase();
const jobUuid = uuidv4();
let isConnected = false;

// Database fields
user.wallet_address
agent.is_active
job.payment_tx_hash
```

### Class/Object Naming
No classes used in codebase. Uses functional programming with plain objects.

---

## Code Style

### JavaScript Standards

**ES6+ Features Used**:
- `async/await` for asynchronous operations
- Arrow functions `() => {}` for callbacks
- Template literals with `` `${}` `` interpolation
- Destructuring assignment `const { a, b } = obj`
- `const`/`let` (no `var`)
- Promise-based error handling

**Examples**:
```javascript
// Async/await
async function generateWithAI(serviceKey, userMessage) {
  try {
    const response = await anthropic.messages.create({...});
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('AI generation error:', error.message);
    throw error;
  }
}

// Destructuring
const { wallet, agentId, skillId, input, price } = req.body;

// Template literals
const html = `
  <!DOCTYPE html>
  <html>
    <body>${content}</body>
  </html>
`;

// Arrow functions
agents.map(agent => ({
  id: agent.id,
  name: agent.name
}))
```

### Indentation & Formatting
- **2 spaces** for indentation (consistent throughout)
- No trailing semicolons (optional style)
- Opening braces on same line `function() {`
- Closing braces on new line

**Example**:
```javascript
router.post('/api/jobs', async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.status(400).json({ error: 'Missing wallet' });
    }
    // ... more code
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### String Formatting
- **Template literals** preferred for interpolation
- **Single quotes** for simple strings (but not enforced)
- **Backticks** for multi-line strings and HTML

```javascript
// Template literals
const message = `Generate 5 creative ideas for: ${topic}`;
const query = `SELECT * FROM users WHERE wallet_address = $1`;

// HTML generation
const html = `
  <div class="card">
    <h2>${agent.name}</h2>
  </div>
`;
```

---

## Error Handling Patterns

### Server-Side Routes

**Standard pattern**:
```javascript
router.post('/api/endpoint', async (req, res) => {
  try {
    // 1. Validate input
    if (!requiredField) {
      return res.status(400).json({ error: 'Missing required field' });
    }

    // 2. Business logic
    const result = await someOperation();

    // 3. Success response
    res.json({ success: true, data: result });
  } catch (error) {
    // 4. Error response
    console.error('Operation error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

**HTTP Status Codes Used**:
- `200` - Success (implicit with `res.json()`)
- `400` - Bad request (missing/invalid fields)
- `404` - Not found (resource doesn't exist)
- `500` - Server error (catch block)

### Client-Side (Frontend)

**Standard pattern**:
```javascript
async function submitJob() {
  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (result.error) {
      throw new Error(result.error);
    }

    // Success handling
    alert('Job submitted successfully!');
  } catch (error) {
    console.error('Job submission error:', error);
    alert('Error: ' + error.message);
  }
}
```

### Database Layer

**Pattern**: Let errors propagate to route handlers
```javascript
async function getUser(walletAddress) {
  const result = await pool.query(
    'SELECT * FROM users WHERE wallet_address = $1',
    [walletAddress.toLowerCase()]
  );
  return result.rows[0] || null;
}
```

No try/catch in database functions - errors bubble up to routes.

---

## Documentation Patterns

### Inline Comments

**Used for**:
- Complex logic explanation
- TODO markers
- Section dividers

**Examples**:
```javascript
// ============================================
// SERVICE ENDPOINTS
// ============================================

// Get or create user
let user = await db.getUser(wallet);
if (!user) {
  user = await db.createUser(wallet, 'human');
}

// TODO: Trigger agent webhook / process job
```

### Service Documentation

**Self-documenting structure in services.js**:
```javascript
brainstorm: {
  name: 'Brainstorm',
  category: 'creative',
  description: 'Generate 5 creative ideas for any topic',
  price: 0.10,
  estimatedTime: '30 seconds',
  inputLabel: 'What topic do you need ideas for?',
  inputPlaceholder: 'e.g., Marketing campaign for a new fitness app',
  systemPrompt: `You are a creative brainstorming assistant...`
}
```

### Function Documentation

**Minimal JSDoc usage** - function names and parameter names are self-explanatory:
```javascript
// No JSDoc needed (clear from signature)
async function createAgent(userId, webhookUrl = null)
async function getSkillsByAgent(agentId)
```

---

## Database Conventions

### Column Naming
- **snake_case** for all columns
- **Suffixes**: `_id` for foreign keys, `_at` for timestamps, `_url` for URLs
- **Prefixes**: `is_` for booleans

**Examples**:
```sql
wallet_address
user_type
api_key
is_active
created_at
updated_at
payment_tx_hash
```

### Query Patterns

**Parameterized queries** (prevents SQL injection):
```javascript
const result = await pool.query(
  'SELECT * FROM users WHERE wallet_address = $1',
  [walletAddress.toLowerCase()]
);
```

**Lowercase transformation** for wallet addresses:
```javascript
walletAddress.toLowerCase()  // Always before DB operations
```

### Transaction Management
Currently not used - all operations are individual queries. Future improvement needed for multi-step operations (e.g., agent registration with skills).

---

## API Conventions

### Request/Response Format

**Request bodies** (JSON):
```javascript
{
  wallet: '0x...',
  agentId: 1,
  skillId: 1,
  input: 'User prompt',
  price: 0.10
}
```

**Success responses**:
```javascript
{
  success: true,
  data: {...},
  jobUuid: '...',
  status: 'pending'
}
```

**Error responses**:
```javascript
{
  error: 'Error message string'
}
```

### Endpoint Naming
- **Nouns for resources**: `/api/users`, `/api/jobs`, `/api/agents`
- **Actions in HTTP method**: `POST /api/jobs` (not `/api/create-job`)
- **RESTful structure**: `GET /api/jobs/:uuid`, `POST /api/jobs/:uuid/pay`

---

## Frontend Conventions

### HTML Structure
- **Semantic HTML5**: `<header>`, `<nav>`, `<main>`, `<section>`
- **BEM-like classes**: `.service-card`, `.job-item`, `.modal-overlay`
- **Data attributes**: `data-agent-id`, `data-skill-id`, `data-price`

### CSS Patterns

**CSS Variables for theming**:
```css
:root {
  --bg: #0a0a0a;
  --bg-card: #1a1a1a;
  --border: #2a2a2a;
  --text: #e5e5e5;
  --text-dim: #a3a3a3;
  --accent: #f97316;
  --accent-dim: #ea580c;
  --success: #22c55e;
  --error: #ef4444;
}
```

**Utility classes**:
```css
.text-center { text-align: center; }
.mb-1 { margin-bottom: 1rem; }
.p-2 { padding: 2rem; }
```

### JavaScript Patterns

**Async functions for API calls**:
```javascript
async function loadData() {
  const res = await fetch('/api/endpoint');
  const data = await res.json();
  return data;
}
```

**DOM manipulation**:
```javascript
document.getElementById('elementId').innerHTML = content;
document.querySelector('.class-name').addEventListener('click', handler);
```

---

## Environment Variable Conventions

### Naming
- **UPPERCASE_SNAKE_CASE** for all env vars
- **Descriptive names**: `ANTHROPIC_API_KEY` not `API_KEY`
- **Prefixes**: None used, but could adopt `APP_`, `DB_`, `API_` prefixes

### Types
```bash
# Server config
PORT=7378

# API keys (secrets)
ANTHROPIC_API_KEY=sk-ant-...
OPENSERV_API_KEY=...

# Blockchain (mix of config and secrets)
WALLET_ADDRESS=0x...       # Public
WALLET_PRIVATE_KEY=...     # Secret

# Database (connection string)
DATABASE_URL=postgresql://...

# Feature flags
REQUIRE_PAYMENT=false

# Environment
NODE_ENV=development|production
```

---

## Git Conventions

### Commit Messages
Not formally defined, but README suggests:
```
feat: Add new feature
fix: Bug fix
docs: Documentation
refactor: Code restructuring
```

### Branch Strategy
Not specified in repository.

---

## Summary Table

| Aspect | Convention | Consistency |
|--------|-----------|------------|
| **File naming** | camelCase | ✅ Consistent |
| **Function naming** | verb-first camelCase | ✅ Consistent |
| **Variable naming** | camelCase (code), snake_case (DB) | ✅ Consistent |
| **Constants** | UPPERCASE_SNAKE_CASE | ✅ Consistent |
| **Indentation** | 2 spaces | ✅ Consistent |
| **String style** | Template literals preferred | ⚠️ Mixed (single/double quotes also used) |
| **Error handling** | try/catch with status codes | ✅ Consistent |
| **API responses** | JSON with error/data keys | ✅ Consistent |
| **Comments** | Minimal, inline for TODOs | ⚠️ Sparse |
| **Documentation** | Service definitions self-documenting | ⚠️ Limited overall |

---
*Last updated: 2026-02-03 after codebase mapping*
