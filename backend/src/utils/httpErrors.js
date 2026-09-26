function logServerError(context, error) {
  if (process.env.NODE_ENV === 'production') {
    console.error(context, {
      name: error && error.name ? error.name : 'Error',
      ...(error && error.code ? { code: error.code } : {})
    });
    return;
  }
  console.error(context, error);
}

function sendServerError(res, error, message) {
  logServerError('API request failed:', error);

  const payload = {
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again.'
      : message
  };

  if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
    payload.error = error.message;
  }

  return res.status(500).json(payload);
}

module.exports = { logServerError, sendServerError };
