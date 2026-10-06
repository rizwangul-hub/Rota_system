const SystemSetting = require('../models/SystemSetting');
const { sendServerError } = require('../utils/httpErrors');
const { logAction } = require('../utils/audit');

const ATTENDANCE_REMINDER_KEY = 'ATTENDANCE_REMINDER';
const DEFAULT_ATTENDANCE_REMINDER = {
  time: '14:00',
  message: "Please remember to record today's staff attendance."
};

function isValidAttendanceReminder(value) {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.time === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) &&
    typeof value.message === 'string' &&
    value.message.trim().length > 0 &&
    value.message.trim().length <= 200;
}

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

exports.getAttendanceReminder = async (req, res) => {
  try {
    const setting = await SystemSetting.findOne({ key: ATTENDANCE_REMINDER_KEY });
    const reminder = isValidAttendanceReminder(setting?.value)
      ? {
          time: setting.value.time,
          message: setting.value.message.trim()
        }
      : DEFAULT_ATTENDANCE_REMINDER;

    return res.json({ success: true, reminder });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch the attendance reminder.');
  }
};

exports.updateAttendanceReminder = async (req, res) => {
  const { time, message } = req.body || {};
  const reminder = { time, message: typeof message === 'string' ? message.trim() : message };
  if (!isValidAttendanceReminder(reminder)) {
    return res.status(400).json({
      success: false,
      message: 'Choose a valid time and enter a reminder message of 1 to 200 characters.'
    });
  }

  try {
    const setting = await SystemSetting.findOneAndUpdate(
      { key: ATTENDANCE_REMINDER_KEY },
      {
        value: reminder,
        description: 'Daily attendance reminder time and message for the Usman attendance app'
      },
      { upsert: true, new: true, runValidators: true }
    );

    await logAction({
      user: req.user._id,
      username: req.user.name,
      action: 'SETTING_UPDATED',
      details: `Updated daily attendance reminder to ${reminder.time}`,
      req
    });

    return res.json({ success: true, reminder: setting.value });
  } catch (error) {
    return sendServerError(res, error, 'Failed to update the attendance reminder.');
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
