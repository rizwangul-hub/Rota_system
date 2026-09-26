const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/login', authController.login);
router.get('/me', authenticate, authController.getMe);
router.get('/users', authenticate, authorize('ADMIN'), authController.getAllUsers);
router.post('/users', authenticate, authorize('ADMIN'), authController.createUser);

module.exports = router;
