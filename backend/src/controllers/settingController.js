const SystemSetting = require('../models/SystemSetting');
const { sendServerError } = require('../utils/httpErrors');
const { logAction } = require('../utils/audit');

exports.getSettings = async (req, res) => {
  try {
    const settings = await SystemSetting.find();
    const map = {};
    settings.forEach(s => { map[s.key] = s.value; });
    res.json({ success: true, settings: map, raw: settings });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch settings.');
  }
};

exports.updateSetting = async (req, res) => {
  try {
    const { key, value, description } = req.body;
    const setting = await SystemSetting.findOneAndUpdate(
      { key },
      { value, description },
      { upsert: true, new: true }
    );

    await logAction({
      user: req.user._id,
      username: req.user.name,
      action: 'SETTING_UPDATED',
      details: `Updated setting ${key} = ${JSON.stringify(value)}`,
      req
    });

    res.json({ success: true, setting });
  } catch (error) {
    return sendServerError(res, error, 'Failed to update setting.');
  }
};
