const AuditLog = require('../models/AuditLog');
const { sendServerError } = require('../utils/httpErrors');

exports.getAuditLogs = async (req, res) => {
  try {
    const { action, username, limit = 100 } = req.query;
    const query = {};
    if (action) query.action = action;
    if (username) query.username = { $regex: username, $options: 'i' };

    const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(Number(limit));
    res.json({ success: true, count: logs.length, logs });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve audit logs.');
  }
};
