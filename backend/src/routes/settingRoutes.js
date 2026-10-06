const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/attendance-reminder', authenticate, settingController.getAttendanceReminder);
router.put('/attendance-reminder', authenticate, authorize('ADMIN'), settingController.updateAttendanceReminder);
router.get('/', authenticate, settingController.getSettings);
router.post('/', authenticate, authorize('ADMIN'), settingController.updateSetting);

module.exports = router;
