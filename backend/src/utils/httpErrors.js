function logServerError(context, error) {
  if (process.env.NODE_ENV === 'production') {
    const missingModule = error && error.code === 'MODULE_NOT_FOUND' &&
      typeof error.message === 'string'
      ? error.message.match(/Cannot find module ['"]([^'"]+)['"]/)?.[1]
      : undefined;
    console.error(context, {
      name: error && error.name ? error.name : 'Error',
      ...(error && error.code ? { code: error.code } : {}),
      ...(missingModule ? { missingModule } : {})
    });
    return;
  }
  console.error(context, error);
}

function sendServerError(res, error, message) {
  logServerError('API request failed:', error);

  const payload = {
    success: false,
    message: message || 'Something went wrong. Please try again.',
    error: error?.message || (typeof error === 'string' ? error : undefined)
  };

  return res.status(500).json(payload);
}

module.exports = { logServerError, sendServerError };
