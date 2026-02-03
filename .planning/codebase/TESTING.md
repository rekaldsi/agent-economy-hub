# Testing Analysis

## Current Status: ❌ NO TESTING INFRASTRUCTURE

### Summary
The agent-economy-hub codebase has **zero formal testing infrastructure**. No test files, no test frameworks, no CI/CD pipeline tests.

---

## Test Infrastructure Audit

### ❌ Test Files
```bash
# Search results: 0 files
find . -name "*.test.js" -o -name "*.spec.js"
(no results)
```

### ❌ Test Framework
**package.json dependencies**:
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.72.1",
    "@openserv-labs/sdk": "^1.8.2",
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "ethers": "^6.16.0",
    "express": "^4.18.2",
    "openai": "^6.17.0",
    "pg": "^8.18.0",
    "uuid": "^13.0.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {}
}
```

**No testing libraries**:
- ❌ Jest
- ❌ Mocha
- ❌ Vitest
- ❌ Supertest (for HTTP endpoint testing)
- ❌ @testing-library/*

**Note**: `zod` is present but used for runtime validation, not testing.

### ❌ Test Scripts
```json
{
  "scripts": {
    "start": "node src/index.js"
  }
}
```
No `test`, `test:unit`, `test:integration`, or `test:e2e` scripts defined.

### ❌ CI/CD Pipeline
- No `.github/workflows/` directory
- No GitHub Actions configuration
- No automated testing on push/PR
- No test coverage reporting

### ❌ Test Configuration
- No `jest.config.js`
- No `vitest.config.js`
- No `mocha.opts` or `.mocharc.json`
- No test environment setup files

---

## Coverage Analysis (What Should Be Tested)

### Critical Untested Areas

#### 1. Database Layer (`src/db.js`) - 273 lines

**Risk Level**: 🔴 **CRITICAL**

**Functions needing tests**:
```javascript
// User operations
✗ getUser(walletAddress)
✗ createUser(wallet, type, name, avatarUrl, bio)

// Agent operations
✗ getAgent(agentId)
✗ getAgentByWallet(wallet)
✗ getAllAgents()
✗ createAgent(userId, webhookUrl)

// Skill operations
✗ createSkill(agentId, name, desc, category, price, time)
✗ getSkillsByAgent(agentId)

// Job operations
✗ createJob(uuid, requesterId, agentId, skillId, input, price)
✗ updateJobStatus(jobId, status, extraFields)
✗ getJob(jobUuid)
✗ getJobsByUser(userId)
✗ getJobsByAgent(agentId)
```

**Why critical**:
- Core data layer for entire app
- Wallet address handling (security concern)
- Job state management (financial implications)
- No validation that schema constraints work

**Test scenarios needed**:
```javascript
// Unit tests for database operations
describe('Database - User Operations', () => {
  test('should create user with lowercase wallet', async () => {
    const user = await db.createUser('0xABC...', 'human', 'Test');
    expect(user.wallet_address).toBe('0xabc...');
  });

  test('should handle duplicate wallet addresses', async () => {
    await db.createUser(wallet1, 'human');
    const user2 = await db.createUser(wallet1, 'human');
    expect(user2).toBeDefined(); // Should use ON CONFLICT logic
  });

  test('should return null for non-existent user', async () => {
    const user = await db.getUser('0xNONEXISTENT');
    expect(user).toBeNull();
  });
});

describe('Database - Job Operations', () => {
  test('should create job with pending status', async () => {
    const job = await db.createJob(uuid, user.id, agent.id, skill.id, {}, 0.10);
    expect(job.status).toBe('pending');
    expect(job.price_usdc).toBe(0.10);
  });

  test('should update job status with extra fields', async () => {
    const job = await db.createJob(...);
    await db.updateJobStatus(job.id, 'paid', { payment_tx_hash: '0x123' });
    const updated = await db.getJob(job.job_uuid);
    expect(updated.status).toBe('paid');
    expect(updated.payment_tx_hash).toBe('0x123');
  });
});
```

---

#### 2. API Endpoints (`src/hub.js` + `src/index.js`) - 2,529 lines

**Risk Level**: 🔴 **CRITICAL**

**Endpoints needing tests**:

**Hub API**:
```
✗ POST /api/users
✗ POST /api/jobs
✗ POST /api/jobs/:uuid/pay
✗ GET /api/jobs/:uuid
✗ GET /api/agents
✗ POST /api/register-agent
✗ GET /api/agents/:id/jobs
✗ GET /api/users/:wallet
✗ GET /api/users/:wallet/jobs
```

**Service API**:
```
✗ POST /api/service/:serviceKey
✗ POST /brainstorm
✗ POST /concept
✗ POST /research
✗ POST /write
✗ POST /brief
✗ GET /api/services
```

**Why critical**:
- User-facing functionality
- Payment processing
- Input validation gaps
- Error handling verification

**Test scenarios needed**:
```javascript
describe('POST /api/jobs', () => {
  test('should create job with valid input', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({
        wallet: testWallet,
        agentId: 1,
        skillId: 1,
        input: 'Test prompt',
        price: 0.10
      });

    expect(res.status).toBe(200);
    expect(res.body.jobUuid).toBeDefined();
    expect(res.body.status).toBe('pending');
  });

  test('should reject missing required fields', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ wallet: testWallet }); // Missing fields

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required fields');
  });

  test('should reject non-existent agent', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({
        wallet: testWallet,
        agentId: 999999, // Doesn't exist
        skillId: 1,
        input: 'Test',
        price: 0.10
      });

    expect(res.status).toBe(500); // Should be 404 ideally
  });
});

describe('POST /api/jobs/:uuid/pay', () => {
  test('should update job with payment hash', async () => {
    const job = await createTestJob();
    const res = await request(app)
      .post(`/api/jobs/${job.jobUuid}/pay`)
      .send({ txHash: '0xABC123...' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
  });

  test('should reject invalid job UUID', async () => {
    const res = await request(app)
      .post('/api/jobs/invalid-uuid/pay')
      .send({ txHash: '0x123' });

    expect(res.status).toBe(404);
  });
});
```

---

#### 3. AI Generation (`src/index.js`) - 872 lines

**Risk Level**: 🟠 **HIGH**

**Function needing tests**:
```javascript
✗ generateWithAI(serviceKey, userMessage)
```

**Why important**:
- Core business logic
- Fragile JSON extraction
- No retry logic
- No fallback handling

**Test scenarios needed**:
```javascript
describe('AI Service Generation', () => {
  beforeEach(() => {
    // Mock Anthropic SDK
    jest.mock('@anthropic-ai/sdk');
  });

  test('should extract JSON from AI response', async () => {
    const mockResponse = {
      content: [{ text: '```json\n{"ideas": ["A", "B"]}\n```' }]
    };
    anthropic.messages.create.mockResolvedValue(mockResponse);

    const result = await generateWithAI('brainstorm', 'test topic');
    expect(result).toHaveProperty('ideas');
    expect(Array.isArray(result.ideas)).toBe(true);
  });

  test('should handle malformed JSON response', async () => {
    const mockResponse = {
      content: [{ text: 'Invalid response without JSON' }]
    };
    anthropic.messages.create.mockResolvedValue(mockResponse);

    await expect(generateWithAI('brainstorm', 'test'))
      .rejects.toThrow('No JSON found in response');
  });

  test('should throw on API error', async () => {
    anthropic.messages.create.mockRejectedValue(new Error('API rate limit'));

    await expect(generateWithAI('brainstorm', 'test'))
      .rejects.toThrow('API rate limit');
  });

  test('should use correct model and tokens', async () => {
    await generateWithAI('brainstorm', 'test');

    expect(anthropic.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000
      })
    );
  });
});
```

---

#### 4. Service Definitions (`src/services.js`) - 642 lines

**Risk Level**: 🟡 **MEDIUM**

**Functions needing tests**:
```javascript
✗ getService(key)
✗ getAllServices()
✗ getServicesByCategory(category)
✗ getCategories()
```

**Test scenarios needed**:
```javascript
describe('Service Catalog', () => {
  test('should retrieve service by key', () => {
    const service = getService('brainstorm');
    expect(service.name).toBe('Brainstorm');
    expect(service.price).toBe(0.10);
  });

  test('should return undefined for invalid key', () => {
    const service = getService('nonexistent');
    expect(service).toBeUndefined();
  });

  test('should list all services as array', () => {
    const services = getAllServices();
    expect(Array.isArray(services)).toBe(true);
    expect(services.length).toBeGreaterThan(10);
  });

  test('should filter services by category', () => {
    const creative = getServicesByCategory('creative');
    expect(creative.every(s => s.category === 'creative')).toBe(true);
  });

  test('should list unique categories', () => {
    const categories = getCategories();
    expect(categories).toContain('creative');
    expect(categories).toContain('research');
    expect(new Set(categories).size).toBe(categories.length); // No duplicates
  });
});
```

---

#### 5. Frontend Wallet Logic (`src/hub.js` - client scripts)

**Risk Level**: 🟡 **MEDIUM**

**Functions needing tests**:
```javascript
✗ connectWallet()
✗ checkWalletConnection()
✗ switchNetwork()
✗ checkUSDCBalance()
✗ payForJob()
```

**Why important**:
- Financial transactions
- User experience
- Network validation

**Test approach**:
- Use Playwright or Cypress for E2E testing
- Mock ethers.js and window.ethereum
- Simulate MetaMask interactions

---

## Test Framework Recommendations

### Recommended Stack

| Tool | Purpose | Reason |
|------|---------|--------|
| **Jest** | Unit & Integration testing | Industry standard, excellent Node.js support |
| **Supertest** | HTTP endpoint testing | Seamless Express integration |
| **@testing-library/jest-dom** | DOM assertions | Better error messages |
| **nock** | HTTP mocking | Mock external API calls (Anthropic) |
| **Playwright** | E2E testing | Test wallet connections, full flows |

### Installation Commands

```bash
# Core testing dependencies
npm install --save-dev jest supertest @types/jest

# Mocking and assertions
npm install --save-dev nock @testing-library/jest-dom

# E2E (optional but recommended)
npm install --save-dev @playwright/test
```

### Configuration Files Needed

**jest.config.js**:
```javascript
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js', // Exclude entry point
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ]
};
```

**package.json scripts**:
```json
{
  "scripts": {
    "start": "node src/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "playwright test"
  }
}
```

---

## Proposed Test Structure

```
agent-economy-hub/
├── src/
│   ├── index.js
│   ├── hub.js
│   ├── services.js
│   └── db.js
├── tests/
│   ├── unit/
│   │   ├── services.test.js
│   │   ├── db.test.js
│   │   └── helpers.test.js
│   ├── integration/
│   │   ├── api-jobs.test.js
│   │   ├── api-agents.test.js
│   │   ├── api-users.test.js
│   │   └── ai-generation.test.js
│   ├── e2e/
│   │   ├── job-flow.spec.js
│   │   ├── agent-registration.spec.js
│   │   └── payment.spec.js
│   └── fixtures/
│       ├── test-users.json
│       ├── test-agents.json
│       └── mock-responses.json
├── jest.config.js
└── playwright.config.js
```

---

## Testing Priorities (Roadmap)

### Phase 1: Critical Coverage (Week 1)
1. ✅ Install Jest + Supertest
2. ✅ Add database layer unit tests
3. ✅ Add API endpoint integration tests
4. ✅ Mock Anthropic API calls
5. ✅ Set up test database (separate from production)

### Phase 2: Core Functionality (Week 2)
1. ✅ Test service definitions
2. ✅ Test job creation flow
3. ✅ Test payment update logic
4. ✅ Test agent registration
5. ✅ Add code coverage reporting

### Phase 3: Advanced Coverage (Week 3)
1. ✅ E2E tests with Playwright
2. ✅ Test wallet connection flows
3. ✅ Test USDC balance checking
4. ✅ Test network switching
5. ✅ CI/CD integration (GitHub Actions)

### Phase 4: Robustness (Week 4)
1. ✅ Error scenario testing
2. ✅ Edge case handling
3. ✅ Performance testing
4. ✅ Security testing (injection, XSS)
5. ✅ Load testing (optional)

---

## Testing Best Practices to Implement

### 1. Test Database Setup
```javascript
// tests/setup.js
const { Pool } = require('pg');

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const testPool = new Pool({ connectionString: TEST_DATABASE_URL });

beforeAll(async () => {
  await testPool.query('DROP SCHEMA public CASCADE');
  await testPool.query('CREATE SCHEMA public');
  await require('../src/db').initDB();
});

afterEach(async () => {
  await testPool.query('TRUNCATE users, agents, skills, jobs, reviews CASCADE');
});

afterAll(async () => {
  await testPool.end();
});
```

### 2. Mock External Services
```javascript
// tests/mocks/anthropic.js
jest.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '{"ideas": ["A", "B", "C"]}' }]
        })
      }
    }))
  };
});
```

### 3. Test Helpers
```javascript
// tests/helpers/factories.js
async function createTestUser(overrides = {}) {
  return await db.createUser(
    overrides.wallet || '0xTEST123',
    overrides.type || 'human',
    overrides.name || 'Test User'
  );
}

async function createTestJob(overrides = {}) {
  const user = await createTestUser();
  const agent = await createTestAgent();
  const skill = await createTestSkill({ agent_id: agent.id });

  return await db.createJob(
    uuidv4(),
    user.id,
    agent.id,
    skill.id,
    overrides.input || { prompt: 'test' },
    overrides.price || 0.10
  );
}
```

---

## Risks of Not Testing

| Risk | Impact | Likelihood |
|------|--------|-----------|
| **Payment bugs** | Users lose money, reputational damage | HIGH |
| **Database corruption** | Data loss, service outage | MEDIUM |
| **API breakage** | Service unavailable, user frustration | HIGH |
| **Security vulnerabilities** | Data breach, financial loss | MEDIUM |
| **Regression bugs** | Features break after changes | HIGH |
| **Onboarding difficulty** | New developers can't verify changes | MEDIUM |

---

## Summary

| Aspect | Status | Priority |
|--------|--------|----------|
| **Unit tests** | ❌ None | 🔴 Critical |
| **Integration tests** | ❌ None | 🔴 Critical |
| **E2E tests** | ❌ None | 🟠 High |
| **Test framework** | ❌ Not configured | 🔴 Critical |
| **CI/CD pipeline** | ❌ Not set up | 🟠 High |
| **Code coverage** | ❌ 0% | 🔴 Critical |
| **Mock services** | ❌ None | 🟠 High |

**Immediate action required**: Add Jest and Supertest, write tests for database and API layers.

---
*Last updated: 2026-02-03 after codebase mapping*
