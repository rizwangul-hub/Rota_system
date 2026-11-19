const express = require('express');
const router = express.Router();
const workerAuthController = require('../controllers/workerAuthController');
const { authenticate, authorize } = require('../middleware/auth');

// Public worker auth endpoints (Email + Password ONLY)
router.post('/login', workerAuthController.login);
router.post('/forgot-password', workerAuthController.forgotPassword);
router.post('/reset-password', workerAuthController.resetPassword);

// Authenticated worker endpoints
router.get('/me', authenticate, authorize('WORKER'), workerAuthController.getMe);
router.post('/change-password', authenticate, authorize('WORKER'), workerAuthController.changePassword);

module.exports = router;
