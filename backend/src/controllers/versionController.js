const SystemSetting = require('../models/SystemSetting');
const { sendServerError } = require('../utils/httpErrors');
const { logAction } = require('../utils/audit');
const packageJson = require('../../package.json');

const SYSTEM_UPDATE_KEY = 'SYSTEM_UPDATE';

// Fallback default release info
const DEFAULT_UPDATE_CONFIG = {
  version: packageJson.version || '2.5.0',
  buildId: process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_ID || `build-${Date.now()}`,
  type: 'normal', // 'normal' | 'critical'
  title: '🚀 System Update Available!',
  message: 'We have improved the system with new features, enhancements, and bug fixes.\n\nPlease refresh the system to experience the latest improvements.',
  releaseNotes: [
    'Performance enhancements and faster scheduling',
    'Smart system update notifications and version management',
    'Enhanced celebration animations and UI improvements'
  ],
  timestamp: new Date().toISOString(),
  criticalDeadline: null // or ISO timestamp
};

/**
 * Public endpoint: GET /api/version
 * Highly lightweight and cached-busted with no-cache headers.
 * Active clients poll this or /version.json to detect new deployments.
 */
exports.getVersion = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    let setting = null;
    try {
      setting = await SystemSetting.findOne({ key: SYSTEM_UPDATE_KEY }).lean();
    } catch {
      // If DB error, gracefully fallback to default config
    }

    const config = setting?.value && typeof setting.value === 'object'
      ? {
          ...DEFAULT_UPDATE_CONFIG,
          ...setting.value,
          // Always ensure buildId is present
          buildId: setting.value.buildId || DEFAULT_UPDATE_CONFIG.buildId
        }
      : DEFAULT_UPDATE_CONFIG;

    return res.json({
      success: true,
      version: config.version,
      buildId: config.buildId,
      type: config.type || 'normal',
      title: config.title || DEFAULT_UPDATE_CONFIG.title,
      message: config.message || DEFAULT_UPDATE_CONFIG.message,
      releaseNotes: Array.isArray(config.releaseNotes) ? config.releaseNotes : DEFAULT_UPDATE_CONFIG.releaseNotes,
      timestamp: config.timestamp || new Date().toISOString(),
      criticalDeadline: config.criticalDeadline || null
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch system version.');
  }
};

/**
 * Admin-only endpoint: PUT /api/version
 * Allows Admin to broadcast a normal or critical update announcement with custom release notes.
 */
exports.updateVersionAnnouncement = async (req, res) => {
  try {
    const {
      version,
      type = 'normal',
      title,
      message,
      releaseNotes,
      criticalDeadline,
      bumpBuild = true
    } = req.body;

    // Validate type
    const safeType = type === 'critical' ? 'critical' : 'normal';

    const existing = await SystemSetting.findOne({ key: SYSTEM_UPDATE_KEY });
    const currentVal = existing?.value || DEFAULT_UPDATE_CONFIG;

    // If bumpBuild is requested or version changed, generate a fresh buildId to force clients to detect an update
    const newBuildId = bumpBuild
      ? `deploy-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`
      : currentVal.buildId || DEFAULT_UPDATE_CONFIG.buildId;

    const updatedConfig = {
      version: typeof version === 'string' && version.trim() ? version.trim() : currentVal.version || '2.5.0',
      buildId: newBuildId,
      type: safeType,
      title: typeof title === 'string' && title.trim()
        ? title.trim()
        : safeType === 'critical'
        ? '⚠️ Important System Update Required!'
        : '🚀 System Update Available!',
      message: typeof message === 'string' && message.trim()
        ? message.trim()
        : safeType === 'critical'
        ? 'A critical system update is available.\n\nWe have made important improvements to system security, reliability, and functionality.\n\nPlease update your system to continue using the latest version.'
        : 'We have improved the system with new features, enhancements, and bug fixes.\n\nPlease refresh the system to experience the latest improvements.',
      releaseNotes: Array.isArray(releaseNotes) && releaseNotes.length > 0
        ? releaseNotes.filter(item => typeof item === 'string' && item.trim().length > 0)
        : currentVal.releaseNotes || DEFAULT_UPDATE_CONFIG.releaseNotes,
      timestamp: new Date().toISOString(),
      criticalDeadline: safeType === 'critical' && criticalDeadline ? new Date(criticalDeadline).toISOString() : null
    };

    const setting = await SystemSetting.findOneAndUpdate(
      { key: SYSTEM_UPDATE_KEY },
      {
        value: updatedConfig,
        description: 'Global system update announcements and version configuration'
      },
      { upsert: true, new: true, runValidators: true }
    );

    await logAction({
      user: req.user._id,
      username: req.user.name,
      action: 'SYSTEM_UPDATE_ANNOUNCED',
      details: `Published ${safeType.toUpperCase()} update v${updatedConfig.version} (Build: ${updatedConfig.buildId})`,
      req
    });

    return res.json({
      success: true,
      message: `${safeType === 'critical' ? 'Critical' : 'Normal'} update announcement broadcast successfully.`,
      config: setting.value
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to publish system update announcement.');
  }
};
