# External Integrations

## Overview
Agent-economy-hub integrates with AI services, blockchain networks, marketplace platforms, and databases to power an AI agent marketplace with cryptocurrency payments.

---

## 1. AI/LLM Services

### Anthropic Claude API

**SDK**: `@anthropic-ai/sdk@^0.72.1`
**Authentication**: API key via `ANTHROPIC_API_KEY` environment variable

**Configuration**:
```javascript
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});
```

**Model Used**: `claude-sonnet-4-20250514`
**Max Tokens**: 2000 per request

**API Endpoint Used**:
```javascript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 2000,
  system: systemPrompt,
  messages: [
    { role: 'user', content: userMessage }
  ]
});
```

**Response Format**:
```javascript
{
  content: [
    {
      type: 'text',
      text: '{"ideas": ["A", "B", "C"]}'  // JSON embedded in text
    }
  ]
}
```

**Services Powered by Claude** (15+ services):
- **Creative**: Brainstorming, campaign concepts, copywriting, creative briefs, social media strategy
- **Research**: Research reports, competitive analysis, trend analysis, sentiment analysis, data analysis
- **Technical**: Code security review, API integration help, web data extraction
- **Documents**: Summarization, document generation, report generation
- **Email**: Email triage and prioritization

**Error Handling**:
- Currently: Errors logged to console, re-thrown to route handler
- No retry logic
- No fallback models
- No rate limiting handling

**Cost Implications**:
- Each request costs based on tokens (input + output)
- No request caching
- No conversation history (stateless)

**Integration Location**: `src/index.js:140-168` (`generateWithAI()` function)

---

## 2. Blockchain Integration

### Base Network (Layer 2 Ethereum)

**Network**: Base (Coinbase L2)
**Chain ID**: 8453 (0x2105 in hex)

**RPC Endpoints**:
- **Alchemy** (primary): `https://base-mainnet.g.alchemy.com/v2/GMcDISyWWgpZWJai3DjVZ`
  - ⚠️ **API key exposed in client-side code** (`hub.js:288`)
- **Public fallback**: `https://mainnet.base.org`

**Block Explorer**: https://basescan.org

**Purpose**: Payment settlement and transaction tracking

**Integration Method**: ethers.js v6 (client-side, in browser)

---

### USDC Smart Contract

**Token**: USD Coin (USDC)
**Contract Address**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base network)
**Standard**: ERC-20
**Decimals**: 6

**ABI Functions Used**:
```javascript
// Read operations
balanceOf(address owner) → uint256
decimals() → uint8
symbol() → string
name() → string

// Write operations
transfer(address to, uint256 amount) → bool
approve(address spender, uint256 amount) → bool
```

**Client-Side Contract Interaction**:
```javascript
const usdcContract = new ethers.Contract(
  USDC_ADDRESS,
  USDC_ABI,
  signer
);

// Check balance
const balance = await usdcContract.balanceOf(userAddress);

// Transfer USDC
const tx = await usdcContract.transfer(
  agentWallet,
  ethers.parseUnits(amount.toString(), 6)  // 6 decimals
);
await tx.wait();  // Wait for confirmation
```

**Agent Wallet**:
- Address: `0xA193128362e6dE28E6D51eEbc98505672FFeb3c5`
- Network: Base
- Purpose: Receives all USDC payments from job requesters

**Integration Location**: `hub.js:105-862` (HUB_SCRIPTS - client-side JavaScript)

---

### Wallet Integration (ethers.js)

**Library**: `ethers@^6.16.0`
**Provider**: `window.ethereum` (MetaMask/Web3 wallet)

**Wallet Operations**:
```javascript
// 1. Connect wallet
const provider = new ethers.BrowserProvider(window.ethereum);
const accounts = await provider.send('eth_requestAccounts', []);
const signer = await provider.getSigner();

// 2. Check network
const network = await provider.getNetwork();
if (network.chainId !== 8453n) {
  await switchNetwork();
}

// 3. Get USDC balance
const usdcContract = new ethers.Contract(USDC_ADDRESS, ABI, provider);
const balance = await usdcContract.balanceOf(account);

// 4. Send payment
const tx = await usdcContract.connect(signer).transfer(
  recipientAddress,
  amount
);
const receipt = await tx.wait();
return receipt.hash;
```

**Network Switching**:
```javascript
async function switchNetwork() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x2105' }]  // 8453 in hex
    });
  } catch (error) {
    if (error.code === 4902) {
      // Network not added, add it
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x2105',
          chainName: 'Base',
          rpcUrls: ['https://mainnet.base.org'],
          nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
          blockExplorerUrls: ['https://basescan.org']
        }]
      });
    }
  }
}
```

**Integration Location**: Client-side in `hub.js:105-862`

---

## 3. Database Services

### PostgreSQL

**Client**: `pg@^8.18.0`
**Connection**: Pool-based connection management

**Configuration**:
```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});
```

**Schema Tables**:
```sql
users       (7 columns)  - Wallet-based user accounts
agents      (9 columns)  - Extended agent profiles
skills      (9 columns)  - Services offered by agents
jobs        (15 columns) - Service requests and payments
reviews     (5 columns)  - Ratings and feedback
```

**Indexes**:
```sql
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_skills_agent ON skills(agent_id);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_jobs_requester ON jobs(requester_id);
CREATE INDEX idx_jobs_agent ON jobs(agent_id);
CREATE INDEX idx_jobs_status ON jobs(status);
```

**Query Pattern**: Parameterized queries with `$1, $2, ...` placeholders
```javascript
await pool.query(
  'SELECT * FROM users WHERE wallet_address = $1',
  [walletAddress.toLowerCase()]
);
```

**Connection Pool Settings**:
- Default pool size (10 connections)
- No custom timeout configuration
- No connection retry logic

**Integration Location**: `src/db.js:1-273`

---

## 4. Marketplace Integration

### OpenServ Platform

**SDK**: `@openserv-labs/sdk@^1.8.2`
**Authentication**: API key via `OPENSERV_API_KEY` environment variable

**Purpose**: Task-based work marketplace integration
**Current Status**: ⚠️ SDK imported but not actively used in codebase

**Potential Features** (not yet implemented):
- Agent registration with OpenServ
- Task capability advertising
- Webhook callbacks for job delivery
- Cross-platform job routing

**Integration Location**: Imported in `package.json` but not used in code

---

## 5. Content Delivery Networks (CDN)

### Cloudflare CDN

**Purpose**: ethers.js library delivery (client-side)

**URL**: `https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js`

**Usage**: Loaded in HTML pages for wallet interaction
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js"></script>
```

### Google Fonts

**Purpose**: Inter typeface for UI

**URL**: `https://fonts.googleapis.com`

**Usage**: Preconnected for performance
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

---

## 6. External APIs (Blockchain)

### Alchemy RPC Provider

**Service**: Blockchain RPC endpoint for Base network
**URL**: `https://base-mainnet.g.alchemy.com/v2/[API_KEY]`

**Operations**:
- `eth_requestAccounts` - Request wallet connection
- `eth_getBalance` - Get ETH balance
- `eth_call` - Call smart contract functions (read)
- `eth_sendTransaction` - Send transactions (write)
- `eth_getTransactionReceipt` - Get transaction status

**Rate Limits**: Depends on Alchemy plan (not configured in code)

### Basescan API

**Purpose**: Transaction verification and block explorer links
**URL Pattern**: `https://basescan.org/tx/{txHash}`

**Usage**: Display transaction links in UI
```javascript
const txLink = `https://basescan.org/tx/${payment_tx_hash}`;
```

---

## 7. Authentication & Authorization

### Wallet-Based Authentication

**Method**: Ethereum wallet address as primary identifier
**No traditional username/password**

**Flow**:
```
1. User connects wallet (MetaMask)
2. Wallet address becomes user ID
3. Address stored in database (lowercase)
4. Address used for all API calls
```

**Implementation**:
```javascript
// Get wallet address
const accounts = await window.ethereum.request({
  method: 'eth_requestAccounts'
});
const wallet = accounts[0];

// Create/get user
const res = await fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ wallet, type: 'human' })
});
```

**Security Considerations**:
- ⚠️ No signature verification
- ⚠️ Address can be spoofed in API calls
- ⚠️ No session management
- ⚠️ Anyone can call endpoints with any wallet address

### Agent API Keys

**Method**: Generated API keys with `hub_` prefix

**Generation**:
```javascript
const apiKey = `hub_${crypto.randomBytes(24).toString('hex')}`;
```

**Storage**: Database in `agents` table
**Usage**: For agent service authentication (future webhook callbacks)

**Current Status**: ⚠️ Generated but not validated on endpoints

---

## 8. Payment Processing

### Payment Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    PAYMENT FLOW                             │
└─────────────────────────────────────────────────────────────┘

1. JOB CREATION
   POST /api/jobs → status: "pending"
        ↓
2. USDC TRANSFER (Client-Side)
   ethers.js → User wallet sends USDC to Agent wallet
        ↓
3. TRANSACTION HASH
   Blockchain returns tx hash: 0xABC...
        ↓
4. PAYMENT CONFIRMATION
   POST /api/jobs/:uuid/pay { txHash }
   → Database: status: "paid", payment_tx_hash
        ↓
5. JOB PROCESSING (TODO: Not Implemented)
   Agent webhook → Process job → Update output_data
        ↓
6. JOB COMPLETION
   status: "delivered" → "completed"
```

**Payment Verification**:
- ⚠️ **No on-chain verification** - Trust client-provided tx hash
- ⚠️ No amount validation
- ⚠️ No confirmation that transaction succeeded
- ⚠️ No timeout if payment doesn't arrive

**Pricing Model**:
```javascript
// Service prices (USDC)
Brainstorm:           $0.10
Concept:              $0.50
Research:             $0.25 - $0.50
Write:                $0.15 - $0.35
Brief:                $1.00
Analysis services:    $0.35 - $0.75
```

---

## Integration Status Summary

| Integration | Status | Critical Issues |
|------------|--------|-----------------|
| **Claude API** | ✅ Working | No retry logic, no fallback |
| **Base Network** | ✅ Working | API key exposed in client code |
| **USDC Contract** | ✅ Working | No payment verification |
| **ethers.js** | ✅ Working | Client-side only, no server validation |
| **PostgreSQL** | ✅ Working | No connection pooling tuning |
| **OpenServ SDK** | ❌ Not Used | Imported but not integrated |
| **Wallet Auth** | ⚠️ Partial | No signature verification |
| **Agent API Keys** | ⚠️ Partial | Generated but not validated |
| **Payment Verification** | ❌ Missing | Trust client, no on-chain check |
| **CDN (ethers.js)** | ✅ Working | — |
| **CDN (Fonts)** | ✅ Working | — |

---

## Security Concerns

### 1. Exposed API Keys
- **Alchemy API key** hardcoded in client-side JavaScript (`hub.js:288`)
- **Risk**: Anyone can use the key, incur costs, hit rate limits
- **Fix**: Proxy blockchain calls through backend

### 2. No Payment Verification
- Transaction hash accepted without validation
- No check that transaction:
  - Actually occurred on-chain
  - Was successful (not reverted)
  - Sent correct amount
  - Went to correct address
- **Fix**: Add server-side transaction verification

### 3. Wallet Address Spoofing
- API endpoints accept wallet addresses in request body
- No cryptographic verification
- Anyone can impersonate any wallet
- **Fix**: Implement signature verification (EIP-712)

### 4. No Rate Limiting
- No protection against API abuse
- Anthropic API costs could escalate
- Database could be overwhelmed
- **Fix**: Add rate limiting middleware (express-rate-limit)

---

## Missing Integrations

### 1. Agent Webhook System
- **Status**: Not implemented
- **Purpose**: Notify agents of new paid jobs
- **Current**: Jobs marked as "paid" but never processed
- **Needed**: HTTP webhook POST to agent's registered URL

### 2. Payout System
- **Status**: Not implemented
- **Purpose**: Send USDC from platform to agents
- **Current**: Agents receive payments directly (no escrow)
- **Potential**: Multi-sig wallet, automated payouts

### 3. Email Notifications
- **Status**: Not implemented
- **Purpose**: Notify users of job status changes
- **Candidates**: SendGrid, Postmark, AWS SES

### 4. Analytics
- **Status**: Not implemented
- **Purpose**: Track usage, performance, revenue
- **Candidates**: Mixpanel, PostHog, custom solution

### 5. File Storage
- **Status**: Not implemented (if needed for attachments)
- **Purpose**: Store job inputs/outputs if files needed
- **Candidates**: AWS S3, Cloudflare R2, IPFS

---

## Integration Priorities (Roadmap)

### Phase 1: Critical Security
1. ✅ Move blockchain RPC to backend (hide Alchemy key)
2. ✅ Implement server-side payment verification
3. ✅ Add wallet signature verification (EIP-712)
4. ✅ Add rate limiting

### Phase 2: Core Functionality
1. ✅ Implement agent webhook system
2. ✅ Add job processing and result storage
3. ✅ Test full payment → processing → delivery flow

### Phase 3: Operational
1. ✅ Add email notifications
2. ✅ Implement analytics tracking
3. ✅ Add logging and monitoring (DataDog, Sentry)

### Phase 4: Scale
1. ✅ Add caching layer (Redis)
2. ✅ Implement job queue (Bull/BullMQ)
3. ✅ Connection pool tuning
4. ✅ CDN for static assets

---

## Environment Variables Reference

```bash
# AI Services
ANTHROPIC_API_KEY=sk-ant-...    # Claude API

# Blockchain (not used server-side currently)
WALLET_ADDRESS=0x...            # Platform wallet (public)
WALLET_PRIVATE_KEY=...          # Platform wallet (secret)

# Marketplace
OPENSERV_API_KEY=...            # OpenServ (not used yet)

# Database
DATABASE_URL=postgresql://...   # PostgreSQL connection string

# Configuration
REQUIRE_PAYMENT=false           # Payment enforcement toggle
NODE_ENV=production             # Environment mode
PORT=7378                       # Server port
```

---
*Last updated: 2026-02-03 after codebase mapping*
