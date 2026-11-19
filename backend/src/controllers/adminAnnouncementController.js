const Announcement = require('../models/Announcement');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const { logAction } = require('../utils/audit');
const { sendServerError } = require('../utils/httpErrors');

/**
 * Helper to calculate total eligible recipients for an announcement
 */
async function countRecipients(targetType, targetShops = [], targetEmployees = []) {
  if (targetType === 'ALL') {
    return await Employee.countDocuments({ employmentStatus: 'Active' });
  }
  if (targetType === 'SHOPS' && targetShops.length > 0) {
    return await Employee.countDocuments({
      assignedShop: { $in: targetShops },
      employmentStatus: 'Active'
    });
  }
  if (targetType === 'EMPLOYEES' && targetEmployees.length > 0) {
    return targetEmployees.length;
  }
  return 0;
}

/**
 * GET /api/admin/announcements
 * Lists announcements for management with readership statistics
 */
exports.getAnnouncements = async (req, res) => {
  try {
    const { status = 'ALL', priority = 'ALL', page = 1, limit = 50 } = req.query;

    const filter = {};
    if (status !== 'ALL') filter.status = status;
    if (priority !== 'ALL') filter.priority = priority;

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const announcements = await Announcement.find(filter)
      .populate('publishedBy', 'name username role')
      .populate('targetShops', 'name code')
      .populate('targetEmployees', 'name employeeId')
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();

    const total = await Announcement.countDocuments(filter);

    // Compute readership metrics for each announcement
    const enriched = await Promise.all(announcements.map(async (a) => {
      const readCount = (a.readBy || []).length;
      const totalRecipients = await countRecipients(a.targetType, a.targetShops, a.targetEmployees);
      const readPercentage = totalRecipients > 0 ? Math.round((readCount / totalRecipients) * 100) : 0;

      return {
        ...a,
        stats: {
          readCount,
          totalRecipients,
          readPercentage
        }
      };
    }));

    return res.json({
      success: true,
      announcements: enriched,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error fetching announcements for admin.');
  }
};

/**
 * POST /api/admin/announcements
 * Publishes a new company announcement with audience targeting
 */
exports.createAnnouncement = async (req, res) => {
  try {
    const {
      title,
      message,
      priority = 'Normal',
      targetType = 'ALL',
      targetShops = [],
      targetEmployees = [],
      expiresAt = null,
      attachment = null
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Announcement title is required.' });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Announcement message body is required.' });
    }

    if (!['Normal', 'Important', 'Urgent'].includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority. Choose Normal, Important, or Urgent.' });
    }

    if (!['ALL', 'SHOPS', 'EMPLOYEES'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Invalid target audience type.' });
    }

    const announcement = await Announcement.create({
      title: title.trim(),
      message: message.trim(),
      priority,
      targetType,
      targetShops: targetType === 'SHOPS' ? targetShops : [],
      targetEmployees: targetType === 'EMPLOYEES' ? targetEmployees : [],
      publishedBy: req.user._id,
      publishedByName: req.user.name || 'Management',
      publishedAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      attachment,
      status: 'Published'
    });

    await logAction({
      user: req.user,
      action: 'ANNOUNCEMENT_CREATED',
      recordType: 'Announcement',
      recordId: announcement._id,
      details: `${req.user.name} published [${priority.toUpperCase()}] announcement: "${title}" (Target: ${targetType}).`,
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Company announcement published successfully.',
      announcement
    });
  } catch (error) {
    return sendServerError(res, error, 'Error creating announcement.');
  }
};

/**
 * PUT /api/admin/announcements/:id
 * Updates an announcement
 */
exports.updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, priority, targetType, targetShops, targetEmployees, expiresAt, status } = req.body;

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    if (title) announcement.title = title.trim();
    if (message) announcement.message = message.trim();
    if (priority && ['Normal', 'Important', 'Urgent'].includes(priority)) announcement.priority = priority;
    if (targetType && ['ALL', 'SHOPS', 'EMPLOYEES'].includes(targetType)) announcement.targetType = targetType;
    if (targetShops) announcement.targetShops = targetShops;
    if (targetEmployees) announcement.targetEmployees = targetEmployees;
    if (expiresAt !== undefined) announcement.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (status && ['Draft', 'Published', 'Archived'].includes(status)) announcement.status = status;

    await announcement.save();

    await logAction({
      user: req.user,
      action: 'ANNOUNCEMENT_UPDATED',
      recordType: 'Announcement',
      recordId: announcement._id,
      details: `${req.user.name} updated announcement "${announcement.title}".`,
      req
    });

    return res.json({
      success: true,
      message: 'Announcement updated successfully.',
      announcement
    });
  } catch (error) {
    return sendServerError(res, error, 'Error updating announcement.');
  }
};

/**
 * POST /api/admin/announcements/:id/archive
 * Archives an announcement
 */
exports.archiveAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    announcement.status = 'Archived';
    await announcement.save();

    await logAction({
      user: req.user,
      action: 'ANNOUNCEMENT_ARCHIVED',
      recordType: 'Announcement',
      recordId: announcement._id,
      details: `${req.user.name} archived announcement "${announcement.title}".`,
      req
    });

    return res.json({
      success: true,
      message: 'Announcement archived successfully.',
      announcement
    });
  } catch (error) {
    return sendServerError(res, error, 'Error archiving announcement.');
  }
};

/**
 * DELETE /api/admin/announcements/:id
 * Safely removes an announcement
 */
exports.deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    await Announcement.deleteOne({ _id: id });

    await logAction({
      user: req.user,
      action: 'ANNOUNCEMENT_DELETED',
      recordType: 'Announcement',
      recordId: id,
      details: `${req.user.name} deleted announcement "${announcement.title}".`,
      req
    });

    return res.json({
      success: true,
      message: 'Announcement deleted successfully.'
    });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting announcement.');
  }
};

/**
 * GET /api/admin/announcements/:id/readership
 * Detailed breakdown of which employees have read an announcement
 */
exports.getReadership = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id)
      .populate('readBy.employee', 'name employeeId assignedShop')
      .lean();

    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    // Determine target recipient employees
    let recipientQuery = { employmentStatus: 'Active' };
    if (announcement.targetType === 'SHOPS' && (announcement.targetShops || []).length > 0) {
      recipientQuery.assignedShop = { $in: announcement.targetShops };
    } else if (announcement.targetType === 'EMPLOYEES' && (announcement.targetEmployees || []).length > 0) {
      recipientQuery._id = { $in: announcement.targetEmployees };
    }

    const allTargetEmployees = await Employee.find(recipientQuery)
      .populate('assignedShop', 'name code')
      .select('name employeeId assignedShop')
      .lean();

    const readMap = new Map();
    (announcement.readBy || []).forEach(r => {
      if (r.employee?._id) {
        readMap.set(String(r.employee._id), r.readAt);
      }
    });

    const readershipList = allTargetEmployees.map(emp => ({
      employeeId: emp.employeeId,
      name: emp.name,
      shopName: emp.assignedShop?.name || 'Unassigned',
      isRead: readMap.has(String(emp._id)),
      readAt: readMap.get(String(emp._id)) || null
    }));

    return res.json({
      success: true,
      title: announcement.title,
      publishedAt: announcement.publishedAt,
      priority: announcement.priority,
      readership: readershipList,
      stats: {
        total: allTargetEmployees.length,
        read: readMap.size,
        unread: allTargetEmployees.length - readMap.size,
        percentage: allTargetEmployees.length > 0 ? Math.round((readMap.size / allTargetEmployees.length) * 100) : 0
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error fetching announcement readership.');
  }
};
