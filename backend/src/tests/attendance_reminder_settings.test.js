const assert = require('node:assert/strict');
const SystemSetting = require('../models/SystemSetting');
const AuditLog = require('../models/AuditLog');
const settingController = require('../controllers/settingController');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

async function run() {
  const originalFindOne = SystemSetting.findOne;
  const originalFindOneAndUpdate = SystemSetting.findOneAndUpdate;
  const originalAuditCreate = AuditLog.create;

  try {
    SystemSetting.findOne = async () => null;
    const defaultResponse = responseRecorder();
    await settingController.getAttendanceReminder({}, defaultResponse);
    assert.deepEqual(defaultResponse.body.reminder, {
      time: '14:00',
      message: "Please remember to record today's staff attendance."
    });

    SystemSetting.findOne = async () => ({
      value: { time: '15:30', message: 'Please check attendance now.' }
    });
    const savedResponse = responseRecorder();
    await settingController.getAttendanceReminder({}, savedResponse);
    assert.deepEqual(savedResponse.body.reminder, {
      time: '15:30',
      message: 'Please check attendance now.'
    });

    const invalidResponse = responseRecorder();
    await settingController.updateAttendanceReminder({
      body: { time: '25:90', message: '' },
      user: { _id: 'admin-id', name: 'Admin' }
    }, invalidResponse);
    assert.equal(invalidResponse.statusCode, 400);

    let savedSetting;
    SystemSetting.findOneAndUpdate = async (filter, update) => {
      assert.equal(filter.key, 'ATTENDANCE_REMINDER');
      savedSetting = update.value;
      return { value: update.value };
    };
    AuditLog.create = async () => ({});
    const updateResponse = responseRecorder();
    await settingController.updateAttendanceReminder({
      body: { time: '09:05', message: '  Mark today attendance.  ' },
      user: { _id: 'admin-id', name: 'Admin' },
      headers: {},
      socket: {}
    }, updateResponse);
    assert.equal(updateResponse.body.success, true);
    assert.deepEqual(savedSetting, {
      time: '09:05',
      message: 'Mark today attendance.'
    });

    console.log('Attendance reminder settings default, validation, and persistence tests passed.');
  } finally {
    SystemSetting.findOne = originalFindOne;
    SystemSetting.findOneAndUpdate = originalFindOneAndUpdate;
    AuditLog.create = originalAuditCreate;
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
