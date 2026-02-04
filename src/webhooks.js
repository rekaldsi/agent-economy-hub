const axios = require('axios');

/**
 * Deliver webhook with retry logic
 * @param {string} webhookUrl - Agent's webhook URL
 * @param {Object} payload - Webhook payload
 * @param {Object} options - { maxAttempts, timeoutMs, retryDelays }
 * @returns {Promise<Object>} { success: boolean, attempts: number, response?, error? }
 */
async function deliverWebhook(webhookUrl, payload, options = {}) {
  const {
    maxAttempts = 4,
    timeoutMs = 30000,
    retryDelays = [0, 1000, 2000, 4000] // Exponential backoff: 0s, 1s, 2s, 4s
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(JSON.stringify({
        event: 'webhook_attempt',
        attempt,
        webhookUrl,
        jobUuid: payload.jobUuid,
        timestamp: new Date().toISOString()
      }));

      // Wait for retry delay (0 on first attempt)
      const delay = retryDelays[attempt - 1] || 0;
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Make HTTP POST with timeout
      const response = await axios.post(webhookUrl, payload, {
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AgentEconomyHub/1.0'
        },
        validateStatus: (status) => status >= 200 && status < 300
      });

      // Success!
      console.log(JSON.stringify({
        event: 'webhook_success',
        attempt,
        webhookUrl,
        jobUuid: payload.jobUuid,
        statusCode: response.status,
        timestamp: new Date().toISOString()
      }));

      return {
        success: true,
        attempts: attempt,
        statusCode: response.status,
        response: response.data
      };

    } catch (error) {
      lastError = error;

      console.error(JSON.stringify({
        event: 'webhook_failure',
        attempt,
        webhookUrl,
        jobUuid: payload.jobUuid,
        error: error.message,
        code: error.code,
        statusCode: error.response?.status,
        timestamp: new Date().toISOString()
      }));

      // Don't retry on 4xx errors (client errors)
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        console.log(JSON.stringify({
          event: 'webhook_abort',
          reason: '4xx_error',
          statusCode: error.response.status,
          jobUuid: payload.jobUuid
        }));

        return {
          success: false,
          attempts: attempt,
          statusCode: error.response.status,
          error: `HTTP ${error.response.status}: ${error.message}`
        };
      }

      // Continue retrying on 5xx or network errors
    }
  }

  // All attempts failed
  console.error(JSON.stringify({
    event: 'webhook_exhausted',
    webhookUrl,
    jobUuid: payload.jobUuid,
    attempts: maxAttempts,
    error: lastError?.message
  }));

  return {
    success: false,
    attempts: maxAttempts,
    error: lastError?.message || 'All webhook attempts failed'
  };
}

/**
 * Notify agent of paid job via webhook
 * @param {Object} job - Job object from database
 * @param {Object} skill - Skill object from database
 * @param {Object} agent - Agent object from database
 */
async function notifyAgent(job, skill, agent) {
  if (!agent.webhook_url) {
    console.log(JSON.stringify({
      event: 'webhook_skip',
      reason: 'no_webhook_url',
      agentId: agent.id,
      jobUuid: job.job_uuid
    }));
    return { success: false, skipped: true, reason: 'no_webhook_url' };
  }

  const payload = {
    jobUuid: job.job_uuid,
    agentId: agent.id,
    skillId: skill.id,
    serviceKey: skill.service_key,
    input: job.input_data,
    price: parseFloat(job.price_usdc),
    paidAt: job.paid_at || new Date().toISOString()
  };

  const result = await deliverWebhook(agent.webhook_url, payload);

  return result;
}

module.exports = {
  deliverWebhook,
  notifyAgent
};
