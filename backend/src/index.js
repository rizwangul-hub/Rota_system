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
  throw new Error('Configure ADMIN_WEB_URL or CORS_ORIGINS in production.');
}

// Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin, configuredOrigins, isProduction)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api', async (req, res, next) => {
  if (req.path === '/health') return next();
  try {
    await connectDB();
    return next();
  } catch (error) {
    return next(error);
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/salaries', salaryRoutes);
app.use('/api/bonuses', bonusRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/settings', settingRoutes);

// Health check
app.get('/api/health', (req, res) => {
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
