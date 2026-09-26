const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/admin', authenticate, authorize('ADMIN'), dashboardController.getAdminDashboard);
router.get('/checker', authenticate, authorize('ATTENDANCE_CHECKER', 'ADMIN'), dashboardController.getCheckerDashboard);
router.get('/distributor', authenticate, authorize('SALARY_DISTRIBUTOR', 'ADMIN'), dashboardController.getDistributorDashboard);

module.exports = router;
