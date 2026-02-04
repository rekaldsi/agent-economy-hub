require('dotenv').config();
const db = require('../src/db');
const { getAllServices } = require('../src/services');
const logger = require('../src/logger');

// MrMagoochi configuration
const MRMAGOOCHI_WALLET = '0xA193128362e6dE28E6D51eEbc98505672FFeb3c5';
const MRMAGOOCHI_NAME = 'MrMagoochi';

/**
 * Main seeding function
 */
async function seed() {
  try {
    logger.info('Starting database seed...');

    // 1. Create or get MrMagoochi user
    logger.info('Checking for MrMagoochi user...');
    let user = await db.getUser(MRMAGOOCHI_WALLET);

    if (user) {
      logger.info('MrMagoochi user already exists', {
        userId: user.id,
        wallet: user.wallet_address,
        name: user.name
      });
    } else {
      logger.info('Creating MrMagoochi user...');
      user = await db.createUser(MRMAGOOCHI_WALLET, 'agent', MRMAGOOCHI_NAME);
      logger.info('MrMagoochi user created', {
        userId: user.id,
        wallet: user.wallet_address,
        name: user.name
      });
    }

    // 2. Create or get MrMagoochi agent
    logger.info('Checking for MrMagoochi agent...');
    let agent = await db.getAgent(user.id);

    if (agent) {
      logger.info('MrMagoochi agent already exists', {
        agentId: agent.id,
        userId: agent.user_id,
        apiKey: agent.api_key ? `${agent.api_key.substring(0, 10)}...` : null,
        webhookUrl: agent.webhook_url || 'none (hub processes directly)'
      });
    } else {
      logger.info('Creating MrMagoochi agent...');
      // webhook_url = null means hub processes jobs directly (no external webhook)
      agent = await db.createAgent(user.id, null);
      logger.info('MrMagoochi agent created', {
        agentId: agent.id,
        userId: agent.user_id,
        apiKey: agent.api_key ? `${agent.api_key.substring(0, 10)}...` : null,
        webhookUrl: 'none (hub processes directly)'
      });
    }

    // Task 4 will add skills seeding here

    logger.info('Database seed complete!');
  } catch (error) {
    logger.error('Seed failed', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    // Close database connection
    await db.closePool();
  }
}

// Run if called directly
if (require.main === module) {
  seed()
    .then(() => {
      logger.info('Seed script finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seed script failed', { error: error.message });
      process.exit(1);
    });
}

module.exports = { seed };
