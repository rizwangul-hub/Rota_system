const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const ssoController = require('../controllers/ssoController');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/login', authController.login);
router.get('/me', authenticate, authController.getMe);
router.get('/users', authenticate, authorize('ADMIN'), authController.getAllUsers);
router.post('/users', authenticate, authorize('ADMIN'), authController.createUser);

// Phase 6A: Central Portal Single Sign-On (SSO) ticket exchange
router.post('/sso/exchange', ssoController.ssoExchange);

module.exports = router;
