const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logServerError } = require('../utils/httpErrors');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Protect routes: verify JWT token
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || !authHeader.slice(7).trim()) {
    return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.slice(7).trim(), JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Session has expired. Please log in again.'
      });
    }
    return res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      message: 'Invalid or expired token.'
    });
  }

  try {
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User account is invalid or deactivated.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    logServerError('Authentication user lookup failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to verify your session. Please try again.'
    });
  }
}

/**
 * Role-based authorization middleware
 * @param  {...string} roles Allowed roles
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: role '${req.user.role}' is not authorized to access this resource.`
      });
    }
    next();
  };
}

module.exports = {
  authenticate,
  authorize,
  JWT_SECRET
};
