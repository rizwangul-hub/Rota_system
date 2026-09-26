const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, settingController.getSettings);
router.post('/', authenticate, authorize('ADMIN'), settingController.updateSetting);

module.exports = router;
