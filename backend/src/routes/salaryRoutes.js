const express = require('express');
const router = express.Router();
const salaryController = require('../controllers/salaryController');
const { authenticate, authorize } = require('../middleware/auth');

// Admin generates weekly salaries from checked attendance
router.post('/generate', authenticate, authorize('ADMIN'), salaryController.generateWeeklySalary);
router.post('/regenerate', authenticate, authorize('ADMIN'), salaryController.regenerateWeeklySalary);

// Week Info & Pending Attendance Check for Admin
router.get('/week-info', authenticate, authorize('ADMIN'), salaryController.getWeekInfo);

// Fetch weekly salaries (Admin and Distributor)
router.get('/', authenticate, authorize('ADMIN', 'SALARY_DISTRIBUTOR'), salaryController.getWeeklySalaries);
router.get('/:id', authenticate, authorize('ADMIN', 'SALARY_DISTRIBUTOR'), salaryController.getWeeklySalaryById);
router.get('/:id/payments', authenticate, authorize('ADMIN', 'SALARY_DISTRIBUTOR'), salaryController.getSalaryPayments);
router.get('/ledger/employee/:employeeId', authenticate, authorize('ADMIN', 'SALARY_DISTRIBUTOR'), salaryController.getEmployeeLedger);

// Admin adds/edits/removes adjustments & deductions
router.post('/:id/adjustments', authenticate, authorize('ADMIN'), salaryController.addAdjustment);
router.put('/adjustments/:adjustmentId', authenticate, authorize('ADMIN'), salaryController.updateAdjustment);
router.delete('/adjustments/:adjustmentId', authenticate, authorize('ADMIN'), salaryController.removeAdjustment);
router.put('/:id/deduction', authenticate, authorize('ADMIN'), salaryController.updateSalaryDeduction);

// Admin finalizes weekly salary
router.post('/:id/finalize', authenticate, authorize('ADMIN'), salaryController.finalizeWeeklySalary);

// Salary Distributor or Admin records payment
router.post('/:id/pay', authenticate, authorize('SALARY_DISTRIBUTOR', 'ADMIN'), salaryController.recordSalaryPayment);

module.exports = router;
