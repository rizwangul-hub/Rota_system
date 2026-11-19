const express = require('express');
const router = express.Router();
const workerDashboardController = require('../controllers/workerDashboardController');
const workerAttendanceController = require('../controllers/workerAttendanceController');
const workerRotaController = require('../controllers/workerRotaController');
const workerSalaryController = require('../controllers/workerSalaryController');
const workerIdCardController = require('../controllers/workerIdCardController');
const workerLeaveController = require('../controllers/workerLeaveController');
const workerAnnouncementController = require('../controllers/workerAnnouncementController');
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

// Phase 6: Digital Employee ID Card & PDF Badge
router.get('/id-card', workerIdCardController.getIdCard);
router.get('/id-card/pdf', workerIdCardController.downloadIdCardPDF);

// Phase 6: Leave Management & Requests
router.get('/leaves', workerLeaveController.getMyLeaves);
router.post('/leaves', workerLeaveController.submitLeaveRequest);
router.get('/leaves/summary', workerLeaveController.getLeaveSummary);
router.post('/leaves/:id/cancel', workerLeaveController.cancelLeaveRequest);

// Phase 6: Company Announcements & Read Receipts
router.get('/announcements', workerAnnouncementController.getAnnouncements);
router.get('/announcements/history', workerAnnouncementController.getAnnouncementHistory);
router.post('/announcements/:id/read', workerAnnouncementController.markAsRead);

module.exports = router;
