const express = require('express');
const router = express.Router();
const workerDashboardController = require('../controllers/workerDashboardController');
const workerAttendanceController = require('../controllers/workerAttendanceController');
const workerRotaController = require('../controllers/workerRotaController');
const workerSalaryController = require('../controllers/workerSalaryController');
const { authenticate, authorize } = require('../middleware/auth');

// All worker routes require authentication and dedicated WORKER role
router.use(authenticate, authorize('WORKER'));

// Worker Dashboard Data Aggregation (Phase 2)
router.get('/dashboard', workerDashboardController.getDashboard);

// Worker Attendance History & Summaries (Phase 3)
router.get('/attendance', workerAttendanceController.getAttendanceHistory);

// Worker Attendance Correction Requests (Phase 3)
router.get('/attendance/corrections', workerAttendanceController.getCorrectionRequests);
router.post('/attendance/corrections', workerAttendanceController.submitCorrectionRequest);

// Worker Weekly Rota & Acknowledgement (Phase 4)
router.get('/rota', workerRotaController.getWeeklyRota);
router.post('/rota/acknowledge', workerRotaController.acknowledgeWeeklyRota);

// Worker Finalized Salaries, Payslips & PDF Download (Phase 5)
router.get('/salaries', workerSalaryController.getSalaries);
router.get('/salaries/:id', workerSalaryController.getSalaryDetails);
router.get('/salaries/:id/payslip-pdf', workerSalaryController.downloadPayslipPDF);

// Worker Salary Ledger & Payments (Phase 5)
router.get('/ledger', workerSalaryController.getLedger);
router.get('/payments', workerSalaryController.getPayments);

module.exports = router;
