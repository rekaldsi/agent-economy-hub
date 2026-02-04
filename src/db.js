const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database schema
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Users table (humans and agents)
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        wallet_address VARCHAR(42) UNIQUE NOT NULL,
        user_type VARCHAR(10) NOT NULL CHECK (user_type IN ('human', 'agent')),
        name VARCHAR(100),
        avatar_url TEXT,
        bio TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Agents table (extends users for agent-specific data)
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        webhook_url TEXT,
        api_key VARCHAR(64) UNIQUE,
        is_active BOOLEAN DEFAULT true,
        total_jobs INTEGER DEFAULT 0,
        total_earned DECIMAL(18, 6) DEFAULT 0,
        rating DECIMAL(3, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Skills offered by agents
      CREATE TABLE IF NOT EXISTS skills (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        category VARCHAR(50),
        price_usdc DECIMAL(18, 6) NOT NULL,
        estimated_time VARCHAR(50),
        service_key TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Jobs / service requests
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        job_uuid VARCHAR(36) UNIQUE NOT NULL,
        requester_id INTEGER REFERENCES users(id),
        agent_id INTEGER REFERENCES agents(id),
        skill_id INTEGER REFERENCES skills(id),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'in_progress', 'delivered', 'completed', 'disputed', 'refunded', 'failed')),
        input_data JSONB,
        output_data JSONB,
        price_usdc DECIMAL(18, 6) NOT NULL,
        payment_tx_hash VARCHAR(66),
        payout_tx_hash VARCHAR(66),
        created_at TIMESTAMP DEFAULT NOW(),
        paid_at TIMESTAMP,
        delivered_at TIMESTAMP,
        completed_at TIMESTAMP
      );

      -- Reviews for completed jobs
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        reviewer_id INTEGER REFERENCES users(id),
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Webhook delivery log
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
        webhook_url TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        status_code INTEGER,
        error TEXT,
        response_body TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_jobs_requester ON jobs(requester_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_agent ON jobs(agent_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_skills_agent ON skills(agent_id);
      CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_job ON webhook_deliveries(job_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_agent ON webhook_deliveries(agent_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_success ON webhook_deliveries(success);
    `);

    // Migration: Add service_key column if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'skills' AND column_name = 'service_key'
        ) THEN
          ALTER TABLE skills ADD COLUMN service_key TEXT;
        END IF;
      END $$;
    `);

    // Migration: Populate service_key for existing skills
    await client.query(`
      UPDATE skills
      SET service_key = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'))
      WHERE service_key IS NULL
    `);

    // Migration: Enhanced reviews table with breakdown scores
    await client.query(`
      DO $$
      BEGIN
        -- Add quality_score column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'reviews' AND column_name = 'quality_score'
        ) THEN
          ALTER TABLE reviews ADD COLUMN quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5);
        END IF;
        
        -- Add speed_score column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'reviews' AND column_name = 'speed_score'
        ) THEN
          ALTER TABLE reviews ADD COLUMN speed_score INTEGER CHECK (speed_score >= 1 AND speed_score <= 5);
        END IF;
        
        -- Add communication_score column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'reviews' AND column_name = 'communication_score'
        ) THEN
          ALTER TABLE reviews ADD COLUMN communication_score INTEGER CHECK (communication_score >= 1 AND communication_score <= 5);
        END IF;
        
        -- Add agent_response column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'reviews' AND column_name = 'agent_response'
        ) THEN
          ALTER TABLE reviews ADD COLUMN agent_response TEXT;
        END IF;
        
        -- Add review_count to agents
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'agents' AND column_name = 'review_count'
        ) THEN
          ALTER TABLE agents ADD COLUMN review_count INTEGER DEFAULT 0;
        END IF;
        
        -- Add completion_rate to agents
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'agents' AND column_name = 'completion_rate'
        ) THEN
          ALTER TABLE agents ADD COLUMN completion_rate DECIMAL(5,2) DEFAULT 100;
        END IF;
        
        -- Add trust_tier to agents
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'agents' AND column_name = 'trust_tier'
        ) THEN
          ALTER TABLE agents ADD COLUMN trust_tier VARCHAR(20) DEFAULT 'new';
        END IF;
      END $$;
    `);

    // Create indexes for reviews
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_job ON reviews(job_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_id);
    `);

    logger.info('Database schema initialized');
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    client.release();
  }
}

// Helper functions
async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

async function getUser(walletAddress) {
  const result = await query(
    'SELECT * FROM users WHERE wallet_address = $1',
    [walletAddress.toLowerCase()]
  );
  return result.rows[0];
}

async function createUser(walletAddress, userType, name = null) {
  const result = await query(
    `INSERT INTO users (wallet_address, user_type, name) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [walletAddress.toLowerCase(), userType, name]
  );
  return result.rows[0];
}

async function getAgent(userId) {
  const result = await query(
    'SELECT a.*, u.wallet_address, u.name, u.avatar_url, u.bio FROM agents a JOIN users u ON a.user_id = u.id WHERE a.user_id = $1',
    [userId]
  );
  return result.rows[0];
}

async function getAgentByWallet(walletAddress) {
  const result = await query(
    `SELECT a.*, u.wallet_address, u.name, u.avatar_url, u.bio 
     FROM agents a 
     JOIN users u ON a.user_id = u.id 
     WHERE u.wallet_address = $1`,
    [walletAddress.toLowerCase()]
  );
  return result.rows[0];
}

async function getAllAgents() {
  const result = await query(
    `SELECT a.*, u.wallet_address, u.name, u.avatar_url, u.bio,
            (SELECT json_agg(s.*) FROM skills s WHERE s.agent_id = a.id AND s.is_active = true) as skills
     FROM agents a 
     JOIN users u ON a.user_id = u.id 
     WHERE a.is_active = true
     ORDER BY a.rating DESC, a.total_jobs DESC`
  );
  return result.rows;
}

async function createAgent(userId, webhookUrl = null) {
  const apiKey = 'hub_' + require('crypto').randomBytes(24).toString('hex');
  const result = await query(
    `INSERT INTO agents (user_id, webhook_url, api_key) 
     VALUES ($1, $2, $3) 
     RETURNING *`,
    [userId, webhookUrl, apiKey]
  );
  return result.rows[0];
}

async function createSkill(agentId, name, description, category, priceUsdc, estimatedTime) {
  const result = await query(
    `INSERT INTO skills (agent_id, name, description, category, price_usdc, estimated_time) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     RETURNING *`,
    [agentId, name, description, category, priceUsdc, estimatedTime]
  );
  return result.rows[0];
}

async function getSkillsByAgent(agentId) {
  const result = await query(
    'SELECT * FROM skills WHERE agent_id = $1 AND is_active = true',
    [agentId]
  );
  return result.rows;
}

async function createJob(jobUuid, requesterId, agentId, skillId, inputData, priceUsdc) {
  const result = await query(
    `INSERT INTO jobs (job_uuid, requester_id, agent_id, skill_id, input_data, price_usdc) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     RETURNING *`,
    [jobUuid, requesterId, agentId, skillId, JSON.stringify(inputData), priceUsdc]
  );
  return result.rows[0];
}

async function updateJobStatus(jobId, status, extraFields = {}) {
  // Whitelist allowed fields to prevent SQL injection
  const allowedFields = [
    'payment_tx_hash',
    'payout_tx_hash',
    'paid_at',
    'delivered_at',
    'completed_at',
    'output_data'
  ];

  const setClauses = ['status = $2'];
  const values = [jobId, status];
  let paramIndex = 3;

  for (const [key, value] of Object.entries(extraFields)) {
    // Security: Only allow whitelisted fields
    if (!allowedFields.includes(key)) {
      logger.warn('Ignoring invalid field in updateJobStatus', { field: key });
      continue;
    }

    setClauses.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }

  const result = await query(
    `UPDATE jobs SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}

async function getJob(jobUuid) {
  const result = await query(
    `SELECT j.*, 
            u_req.wallet_address as requester_wallet,
            u_agent.wallet_address as agent_wallet,
            u_agent.name as agent_name,
            s.name as skill_name
     FROM jobs j
     JOIN users u_req ON j.requester_id = u_req.id
     JOIN agents a ON j.agent_id = a.id
     JOIN users u_agent ON a.user_id = u_agent.id
     JOIN skills s ON j.skill_id = s.id
     WHERE j.job_uuid = $1`,
    [jobUuid]
  );
  return result.rows[0];
}

async function getJobsByUser(userId) {
  const result = await query(
    `SELECT j.*, s.name as skill_name, u.name as agent_name
     FROM jobs j
     JOIN skills s ON j.skill_id = s.id
     JOIN agents a ON j.agent_id = a.id
     JOIN users u ON a.user_id = u.id
     WHERE j.requester_id = $1
     ORDER BY j.created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function getJobsByAgent(agentId) {
  const result = await query(
    `SELECT j.*, s.name as skill_name, u.name as requester_name, u.wallet_address as requester_wallet
     FROM jobs j
     JOIN skills s ON j.skill_id = s.id
     JOIN users u ON j.requester_id = u.id
     WHERE j.agent_id = $1
     ORDER BY j.created_at DESC`,
    [agentId]
  );
  return result.rows;
}

async function getSkill(skillId) {
  const result = await query(
    'SELECT * FROM skills WHERE id = $1',
    [skillId]
  );
  return result.rows[0];
}

/**
 * Log webhook delivery attempt
 */
async function logWebhookDelivery(jobId, agentId, webhookUrl, result) {
  await query(
    `INSERT INTO webhook_deliveries (job_id, agent_id, webhook_url, attempts, success, status_code, error, response_body)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      jobId,
      agentId,
      webhookUrl,
      result.attempts || 0,
      result.success || false,
      result.statusCode || null,
      result.error || null,
      result.response ? JSON.stringify(result.response) : null
    ]
  );
}

/**
 * Mark job as in-progress (agent is processing)
 */
async function markJobInProgress(jobId) {
  return updateJobStatus(jobId, 'in_progress', {
    // No additional fields needed
  });
}

/**
 * Create a review for a completed job
 */
async function createReview(jobId, reviewerId, rating, comment, qualityScore, speedScore, communicationScore) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get the job to find the agent
    const jobResult = await client.query('SELECT agent_id FROM jobs WHERE id = $1', [jobId]);
    if (jobResult.rows.length === 0) {
      throw new Error('Job not found');
    }
    const agentId = jobResult.rows[0].agent_id;

    // Check if review already exists for this job
    const existingReview = await client.query('SELECT id FROM reviews WHERE job_id = $1', [jobId]);
    if (existingReview.rows.length > 0) {
      throw new Error('Review already exists for this job');
    }

    // Create the review
    const reviewResult = await client.query(
      `INSERT INTO reviews (job_id, reviewer_id, rating, comment, quality_score, speed_score, communication_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [jobId, reviewerId, rating, comment, qualityScore, speedScore, communicationScore]
    );

    // Update agent's rating and review_count
    await client.query(`
      UPDATE agents SET 
        review_count = review_count + 1,
        rating = (
          SELECT COALESCE(AVG(rating), 0)
          FROM reviews r
          JOIN jobs j ON r.job_id = j.id
          WHERE j.agent_id = $1
        )
      WHERE id = $1
    `, [agentId]);

    await client.query('COMMIT');
    return reviewResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get reviews for an agent
 */
async function getAgentReviews(agentId, limit = 20, offset = 0) {
  const result = await query(
    `SELECT r.*, 
            j.job_uuid, 
            s.name as skill_name,
            u.wallet_address as reviewer_wallet,
            u.name as reviewer_name
     FROM reviews r
     JOIN jobs j ON r.job_id = j.id
     JOIN skills s ON j.skill_id = s.id
     JOIN users u ON r.reviewer_id = u.id
     WHERE j.agent_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [agentId, limit, offset]
  );
  return result.rows;
}

/**
 * Get review stats for an agent
 */
async function getAgentReviewStats(agentId) {
  const result = await query(
    `SELECT 
       COUNT(*) as total_reviews,
       COALESCE(AVG(rating), 0) as avg_rating,
       COALESCE(AVG(quality_score), 0) as avg_quality,
       COALESCE(AVG(speed_score), 0) as avg_speed,
       COALESCE(AVG(communication_score), 0) as avg_communication,
       COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
       COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
       COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
       COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
       COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
     FROM reviews r
     JOIN jobs j ON r.job_id = j.id
     WHERE j.agent_id = $1`,
    [agentId]
  );
  return result.rows[0];
}

/**
 * Add agent response to a review
 */
async function addAgentResponse(reviewId, agentId, response) {
  // Verify the review belongs to this agent
  const verifyResult = await query(
    `SELECT r.id FROM reviews r
     JOIN jobs j ON r.job_id = j.id
     WHERE r.id = $1 AND j.agent_id = $2`,
    [reviewId, agentId]
  );
  
  if (verifyResult.rows.length === 0) {
    throw new Error('Review not found or not owned by this agent');
  }

  const result = await query(
    `UPDATE reviews SET agent_response = $1 WHERE id = $2 RETURNING *`,
    [response, reviewId]
  );
  return result.rows[0];
}

/**
 * Get agent by ID
 */
async function getAgentById(agentId) {
  const result = await query(
    `SELECT a.*, u.wallet_address, u.name, u.avatar_url, u.bio 
     FROM agents a 
     JOIN users u ON a.user_id = u.id 
     WHERE a.id = $1`,
    [agentId]
  );
  return result.rows[0];
}

/**
 * Update agent completion rate
 */
async function updateAgentCompletionRate(agentId) {
  await query(`
    UPDATE agents SET completion_rate = (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 100
        ELSE (COUNT(CASE WHEN status = 'completed' THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100
      END
      FROM jobs 
      WHERE agent_id = $1 AND status IN ('completed', 'failed', 'refunded')
    )
    WHERE id = $1
  `, [agentId]);
}

/**
 * Get platform stats
 */
async function getPlatformStats() {
  const result = await query(`
    SELECT 
      (SELECT COUNT(*) FROM agents WHERE is_active = true) as total_agents,
      (SELECT COUNT(*) FROM skills WHERE is_active = true) as total_skills,
      (SELECT COUNT(*) FROM jobs WHERE status = 'completed') as total_jobs_completed,
      (SELECT COALESCE(SUM(price_usdc), 0) FROM jobs WHERE status = 'completed') as total_volume,
      (SELECT COALESCE(AVG(a.rating), 0) FROM agents a WHERE a.review_count > 0) as avg_platform_rating
  `);
  return result.rows[0];
}

/**
 * Gracefully close database connection pool
 */
async function closePool() {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error('Error closing database pool', { error: error.message });
    throw error;
  }
}

module.exports = {
  pool,
  query,
  initDB,
  closePool,
  getUser,
  createUser,
  getAgent,
  getAgentById,
  getAgentByWallet,
  getAllAgents,
  createAgent,
  createSkill,
  getSkillsByAgent,
  getSkill,
  createJob,
  updateJobStatus,
  getJob,
  getJobsByUser,
  getJobsByAgent,
  logWebhookDelivery,
  markJobInProgress,
  // Review functions
  createReview,
  getAgentReviews,
  getAgentReviewStats,
  addAgentResponse,
  updateAgentCompletionRate,
  getPlatformStats
};
