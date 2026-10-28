const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { sendServerError } = require('../utils/httpErrors');

const SSO_ISSUER = 'https://portal.pixxtech.internal';
const ALLOWED_AUDIENCES = ['rota-system'];
const ALLOWED_ALGORITHMS = ['HS256'];

// Atomic in-memory replay prevention cache
const redeemedTickets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [jti, expMs] of redeemedTickets.entries()) {
    if (now > expMs) {
      redeemedTickets.delete(jti);
    }
  }
}, 60000).unref();

const getSSOSecret = () => {
  return process.env.SSO_SECRET || process.env.CENTRAL_PORTAL_SECRET || JWT_SECRET || 'pixxtech_central_portal_sso_secret_2026';
};

/**
 * Exchange Central Portal SSO authorization ticket for Rota System session JWT
 * POST /api/auth/sso/exchange
 */
exports.ssoExchange = async (req, res) => {
  try {
    const { ticket } = req.body;

    if (!ticket || typeof ticket !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'SSO authorization ticket is required.',
      });
    }

    const ssoSecret = getSSOSecret();
    let decoded;

    try {
      decoded = jwt.verify(ticket, ssoSecret, {
        issuer: SSO_ISSUER,
        algorithms: ALLOWED_ALGORITHMS,
      });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TICKET_EXPIRED',
          message: 'The SSO authorization ticket has expired. Please launch again from Central Portal.',
        });
      }
      return res.status(401).json({
        success: false,
        code: 'TICKET_INVALID',
        message: `Invalid SSO authorization ticket: ${err.message}`,
      });
    }

    // Audience verification
    if (!ALLOWED_AUDIENCES.includes(decoded.aud)) {
      return res.status(403).json({
        success: false,
        code: 'AUDIENCE_MISMATCH',
        message: `Ticket audience mismatch. Expected 'rota-system', got '${decoded.aud}'.`,
      });
    }

    // Required claims
    if (!decoded.jti || !decoded.sub || !decoded.email) {
      return res.status(400).json({
        success: false,
        message: 'SSO ticket is missing mandatory identity claims (jti, sub, email).',
      });
    }

    // Atomic replay protection
    if (redeemedTickets.has(decoded.jti)) {
      return res.status(401).json({
        success: false,
        code: 'TICKET_REPLAYED',
        message: 'SSO ticket has already been redeemed (replay detected).',
      });
    }

    const expMs = (decoded.exp || Math.floor(Date.now() / 1000) + 300) * 1000;
    redeemedTickets.set(decoded.jti, expMs);

    const email = decoded.email.toLowerCase().trim();
    const candidateUsername = (decoded.username || email.split('@')[0]).toLowerCase().trim();

    // Resolve local user: match on email first, or fallback to exact username
    const user = await User.findOne({
      $or: [
        { email: email },
        { username: candidateUsername },
        { username: email },
      ],
    }).populate('assignedShop');

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_MAPPED',
        message: `No active Rota System account mapped to '${email}' or username '${candidateUsername}'. Please contact your administrator.`,
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        code: 'USER_DEACTIVATED',
        message: 'This account has been deactivated in Rota System.',
      });
    }

    // Issue Rota System native JWT token (30 days validity per Rota standard)
    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username },
      JWT_SECRET || 'rota_jwt_secret',
      { expiresIn: '30d' }
    );

    // Audit log SSO login
    await logAction({
      user: user._id,
      username: user.name,
      role: user.role,
      action: 'SSO_LOGIN',
      recordType: 'User',
      recordId: user._id,
      details: `User logged in via Central Portal SSO with role ${user.role}`,
      req,
    });

    return res.status(200).json({
      success: true,
      message: 'SSO login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        assignedShop: user.assignedShop,
      },
    });
  } catch (error) {
    console.error('[Rota SSO Exchange Error]:', error);
    return sendServerError(res, error, 'Server error during SSO exchange.');
  }
};
