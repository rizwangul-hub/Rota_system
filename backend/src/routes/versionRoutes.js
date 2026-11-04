const express = require('express');
const router = express.Router();
const versionController = require('../controllers/versionController');
const { authenticate, authorize } = require('../middleware/auth');

// Public lightweight endpoint for version polling and update detection
router.get('/', versionController.getVersion);

// Admin-only endpoint for publishing system updates and setting critical update deadlines
router.put('/', authenticate, authorize('ADMIN'), versionController.updateVersionAnnouncement);

module.exports = router;
