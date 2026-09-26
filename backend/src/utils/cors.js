function normalizeAllowedOrigins(environment) {
  const origins = [
    ...(environment.CORS_ORIGINS || '').split(','),
    environment.ADMIN_WEB_URL || ''
  ].map(origin => origin.trim()).filter(Boolean).map(origin => {
    if (origin === '*') return '*';
    if (origin.startsWith('*.')) return origin;
    try {
      return new URL(origin).origin;
    } catch {
      throw new Error('CORS_ORIGINS and ADMIN_WEB_URL must contain valid absolute URLs.');
    }
  });
  return [...new Set(origins)];
}

function isAllowedOrigin(origin, allowedOrigins, isProduction) {
  if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    return true;
  }
  for (const allowed of allowedOrigins) {
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1);
      try {
        const originUrl = new URL(origin);
        if (originUrl.hostname.endsWith(suffix)) {
          return true;
        }
      } catch {}
    }
  }
  return !isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

module.exports = { normalizeAllowedOrigins, isAllowedOrigin };
