const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

// Usman or Admin saves attendance (single or batch)
router.post('/', authenticate, authorize('ATTENDANCE_OPERATOR', 'ADMIN'), attendanceController.saveAttendance);
router.post('/batch', authenticate, authorize('ATTENDANCE_OPERATOR', 'ADMIN'), attendanceController.saveAttendanceBatch);

// Sarfraz or Admin views pending attendance
router.get('/pending', authenticate, authorize('ATTENDANCE_CHECKER', 'ADMIN'), attendanceController.getPendingAttendance);

// General attendance list/history
router.get('/', authenticate, attendanceController.getAllAttendance);
router.get('/:id', authenticate, attendanceController.getAttendanceById);

// Usman (while draft/pending), Sarfraz, or Admin edits attendance
router.put('/:id', authenticate, authorize('ATTENDANCE_OPERATOR', 'ATTENDANCE_CHECKER', 'ADMIN'), attendanceController.updateAttendanceRecord);

// Sarfraz or Admin approves attendance
router.post('/approve', authenticate, authorize('ATTENDANCE_CHECKER', 'ADMIN'), attendanceController.approveAttendance);
router.post('/:id/approve', authenticate, authorize('ATTENDANCE_CHECKER', 'ADMIN'), attendanceController.approveAttendance);

module.exports = router;

