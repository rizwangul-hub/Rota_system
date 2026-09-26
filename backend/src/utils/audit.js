const AuditLog = require('../models/AuditLog');
const { logServerError } = require('./httpErrors');

/**
 * Log an auditable event
 */
async function logAction({ user, username, role, action, recordType = '', recordId = '', details = '', req = null }) {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') : '';
    await AuditLog.create({
      user: user?._id || user || null,
      username: username || user?.name || user?.username || 'System',
      role: role || user?.role || 'SYSTEM',
      action,
      recordType,
      recordId: recordId ? String(recordId) : '',
      details,
      ipAddress
    });
  } catch (err) {
    logServerError('Failed to write audit log:', err);
  }
}

module.exports = {
  logAction
};
