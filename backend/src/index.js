require('./utils/pdfkitFontPatch'); // MUST be first — patches Module resolver so pdfkit finds its fonts on Vercel
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { normalizeAllowedOrigins, isAllowedOrigin } = require('./utils/cors');
const { logServerError } = require('./utils/httpErrors');

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const bonusRoutes = require('./routes/bonusRoutes');
const reportRoutes = require('./routes/reportRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const auditRoutes = require('./routes/auditRoutes');
const settingRoutes = require('./routes/settingRoutes');
const rotaRoutes = require('./routes/rotaRoutes');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = normalizeAllowedOrigins(process.env);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
    (isProduction && /^replace_|placeholder|change.?me|your.?secret/i.test(process.env.JWT_SECRET))) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters.');
}
if (isProduction && !process.env.MONGO_URI) {
  throw new Error('MONGO_URI must be configured in production.');
}
if (isProduction && configuredOrigins.length === 0) {
  console.warn('⚠️ [CORS] No ADMIN_WEB_URL or CORS_ORIGINS configured. Allowing requests from all origins by default.');
}

// Restore original request URL if rewritten by Vercel serverless router
app.use((req, res, next) => {
  if (req.url.endsWith('.js') || req.url.includes('.js?')) {
    const rawMatches = req.headers['x-now-route-matches'];
    if (rawMatches) {
      try {
        const params = new URLSearchParams(rawMatches);
        const matched = params.get('1');
        if (matched) {
          req.url = matched.startsWith('/') ? matched : '/' + matched;
        }
      } catch {}
    }
    const forwarded = req.headers['x-matched-path'] || req.headers['x-forwarded-url'] || req.headers['x-forwarded-uri'] || req.headers['x-original-url'];
    if (forwarded && (req.url.endsWith('.js') || req.url.includes('.js?')) && !forwarded.endsWith('.js')) {
      req.url = forwarded;
    }
  }
  next();
});

// Root endpoint for Vercel health/browser checks
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'PixxTechnologies Rota & Payroll API',
    version: '1.0.0',
    health: '/api/health',
    time: new Date().toISOString()
  });
});
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/favicon.png', (req, res) => res.status(204).end());

// Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || configuredOrigins.length === 0 || isAllowedOrigin(origin, configuredOrigins, isProduction)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));
app.use(express.json({ limit: '1mb' }));

app.use(async (req, res, next) => {
  if (req.path === '/health' || req.path === '/api/health' || req.path === '/' || req.path === '/favicon.ico' || req.path === '/favicon.png') {
    return next();
  }
  try {
    await connectDB();
    return next();
  } catch (error) {
    return next(error);
  }
});

// Routes (mounted with and without /api prefix for Vercel serverless compatibility)
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/api/shops', shopRoutes);
app.use('/shops', shopRoutes);

app.use('/api/employees', employeeRoutes);
app.use('/employees', employeeRoutes);

app.use('/api/attendance', attendanceRoutes);
app.use('/attendance', attendanceRoutes);

app.use('/api/salaries', salaryRoutes);
app.use('/salaries', salaryRoutes);

app.use('/api/bonuses', bonusRoutes);
app.use('/bonuses', bonusRoutes);

app.use('/api/reports', reportRoutes);
app.use('/reports', reportRoutes);

app.use('/api/dashboard', dashboardRoutes);
app.use('/dashboard', dashboardRoutes);

app.use('/api/audit', auditRoutes);
app.use('/audit', auditRoutes);

app.use('/api/settings', settingRoutes);
app.use('/settings', settingRoutes);

app.use('/api/rota', rotaRoutes);
app.use('/rota', rotaRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'PixxTechnologies Rota & Payroll API',
    time: new Date().toISOString()
  });
});
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'PixxTechnologies Rota & Payroll API',
    time: new Date().toISOString()
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  logServerError('Unhandled API error:', error);
  if (error.message === 'Origin is not allowed by CORS.') {
    return res.status(403).json({ success: false, message: 'Origin is not allowed.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large.' });
  }
  return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
});

module.exports = app;
