/**
 * AI Assistant Configuration
 */
function getAiConfig() {
  const enabled = process.env.AI_ENABLED !== 'false';
  const provider = process.env.AI_PROVIDER || 'gemini';
  const model = process.env.AI_MODEL || 'gemini-3.5-flash-lite';
  const key = process.env.GEMINI_API_KEY || '';

  return {
    enabled,
    provider,
    model,
    key,
    configured: Boolean(key && key.trim())
  };
}

class AiError extends Error {
  constructor(message, status = 500, code = 'AI_ERROR') {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.code = code;
  }
}

module.exports = {
  getAiConfig,
  AiError
};
