const express = require('express');
const router = express.Router();
const adminWorkerAccountController = require('../controllers/adminWorkerAccountController');
const { authenticate, authorize } = require('../middleware/auth');

// All endpoints in this router are restricted to ADMIN only
router.use(authenticate, authorize('ADMIN'));

router.get('/', adminWorkerAccountController.getWorkerAccounts);
router.post('/', adminWorkerAccountController.createWorkerAccount);
router.patch('/:userId/toggle-status', adminWorkerAccountController.toggleWorkerAccountStatus);
router.post('/:userId/reset-password', adminWorkerAccountController.adminResetPassword);

module.exports = router;
