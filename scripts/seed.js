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

    // Task 2 will add user seeding here
    // Task 3 will add agent seeding here
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
