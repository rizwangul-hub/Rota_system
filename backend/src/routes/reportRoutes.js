const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

// ============================================================
// 1. ATTENDANCE REPORTS
// ============================================================

// Daily Attendance Report (Admin, Sarfraz, Usman)
router.get(
  '/daily-attendance',
  authenticate,
  authorize('ADMIN', 'ATTENDANCE_CHECKER', 'ATTENDANCE_OPERATOR'),
  reportController.getDailyAttendanceReport
);
router.get(
  '/daily-attendance/excel',
  authenticate,
  authorize('ADMIN', 'ATTENDANCE_CHECKER'),
  reportController.exportDailyAttendanceExcel
);
router.get(
  '/daily-attendance/pdf',
  authenticate,
  authorize('ADMIN', 'ATTENDANCE_CHECKER'),
  reportController.exportDailyAttendancePDF
);

// Weekly Attendance Report (Admin & Sarfraz)
router.get(
  '/weekly-attendance',
  authenticate,
  authorize('ADMIN', 'ATTENDANCE_CHECKER'),
  reportController.getWeeklyAttendanceReport
);
router.get(
  '/weekly-attendance/excel',
  authenticate,
  authorize('ADMIN', 'ATTENDANCE_CHECKER'),
  reportController.exportWeeklyAttendanceExcel
);
router.get(
  '/weekly-attendance/pdf',
  authenticate,
  authorize('ADMIN', 'ATTENDANCE_CHECKER'),
  reportController.exportWeeklyAttendancePDF
);

// Weekly Staff Grouped Report (Preserved for backwards compatibility)
router.get(
  '/weekly-staff',
  authenticate,
  authorize('ADMIN', 'ATTENDANCE_CHECKER'),
  reportController.getWeeklyStaffReport
);

// ============================================================
// 2. SALARY & PAYROLL REPORTS (Admin only)
// ============================================================

// Weekly Salary Report
router.get(
  '/weekly-salary',
  authenticate,
  authorize('ADMIN'),
  reportController.getWeeklySalaryReport
);
router.get(
  '/weekly-salary/excel',
  authenticate,
  authorize('ADMIN'),
  reportController.exportWeeklySalaryExcel
);
router.get(
  '/weekly-salary/pdf',
  authenticate,
  authorize('ADMIN'),
  reportController.exportWeeklySalaryPDF
);

// Employee Salary History
router.get(
  '/salary/history',
  authenticate,
  authorize('ADMIN'),
  reportController.getEmployeeSalaryHistory
);
router.get(
  '/employee-salary-history',
  authenticate,
  authorize('ADMIN'),
  reportController.getEmployeeSalaryHistory
);

// Single Employee Monthly Report
router.get(
  '/employee-monthly',
  authenticate,
  authorize('ADMIN'),
  reportController.getEmployeeMonthlyReport
);
router.get(
  '/employee-monthly/excel',
  authenticate,
  authorize('ADMIN'),
  reportController.exportEmployeeMonthlyExcel
);
router.get(
  '/employee-monthly/pdf',
  authenticate,
  authorize('ADMIN'),
  reportController.exportEmployeeMonthlyPDF
);

// Single Employee Yearly Report
router.get(
  '/employee-yearly',
  authenticate,
  authorize('ADMIN'),
  reportController.getEmployeeYearlyReport
);
router.get(
  '/employee-yearly/excel',
  authenticate,
  authorize('ADMIN'),
  reportController.exportEmployeeYearlyExcel
);
router.get(
  '/employee-yearly/pdf',
  authenticate,
  authorize('ADMIN'),
  reportController.exportEmployeeYearlyPDF
);

// ============================================================
// 3. BONUS & COMMISSION REPORTS (Admin only)
// ============================================================

router.get(
  '/bonus',
  authenticate,
  authorize('ADMIN'),
  reportController.getBonusReport
);
router.get(
  '/bonus/employee/:employeeId',
  authenticate,
  authorize('ADMIN'),
  reportController.getEmployeeBonusHistory
);
router.get(
  '/commission/excel',
  authenticate,
  authorize('ADMIN'),
  reportController.exportCommissionExcel
);
router.get(
  '/bonus/excel',
  authenticate,
  authorize('ADMIN'),
  reportController.exportCommissionExcel
);
router.get(
  '/bonus/pdf',
  authenticate,
  authorize('ADMIN'),
  reportController.exportBonusPDF
);

// ============================================================
// 4. SHOP LABOUR HOURS REPORTS
// ============================================================

router.get(
  '/shop-labour',
  authenticate,
  authorize('ADMIN', 'ATTENDANCE_CHECKER'),
  reportController.getShopLabourHours
);
router.get(
  '/shop-labour/monthly',
  authenticate,
  authorize('ADMIN', 'ATTENDANCE_CHECKER'),
  reportController.getMonthlyShopLabourSummary
);
router.get(
  '/shop-labour/excel',
  authenticate,
  authorize('ADMIN', 'ATTENDANCE_CHECKER'),
  reportController.exportShopLabourExcel
);
router.get(
  '/shop-labour/pdf',
  authenticate,
  authorize('ADMIN', 'ATTENDANCE_CHECKER'),
  reportController.exportShopLabourPDF
);

// ============================================================
// 5. SALARY PAYMENT & DISBURSEMENT REPORTS (Admin & Salary Distributor)
// ============================================================

router.get(
  '/payments',
  authenticate,
  authorize('ADMIN', 'SALARY_DISTRIBUTOR'),
  reportController.getSalaryPaymentsReport
);
router.get(
  '/payments/summary',
  authenticate,
  authorize('ADMIN', 'SALARY_DISTRIBUTOR'),
  reportController.getPaymentsSummary
);
router.get(
  '/payments/excel',
  authenticate,
  authorize('ADMIN', 'SALARY_DISTRIBUTOR'),
  reportController.exportSalaryPaymentsExcel
);
router.get(
  '/payments/pdf',
  authenticate,
  authorize('ADMIN', 'SALARY_DISTRIBUTOR'),
  reportController.exportSalaryPaymentsPDF
);

// ============================================================
// 6. EMPLOYEE SALARY LEDGER (Admin & Salary Distributor)
// ============================================================

router.get(
  '/ledger/:employeeId',
  authenticate,
  authorize('ADMIN', 'SALARY_DISTRIBUTOR'),
  reportController.getEmployeeLedger
);
router.get(
  '/ledger/:employeeId/excel',
  authenticate,
  authorize('ADMIN', 'SALARY_DISTRIBUTOR'),
  reportController.exportEmployeeLedgerExcel
);
router.get(
  '/ledger/:employeeId/pdf',
  authenticate,
  authorize('ADMIN', 'SALARY_DISTRIBUTOR'),
  reportController.exportEmployeeLedgerPDF
);

// ============================================================
// 7. COMPANY-WIDE PAYROLL SUMMARY & ANALYTICS (Admin only)
// ============================================================

router.get(
  '/summary',
  authenticate,
  authorize('ADMIN'),
  reportController.getCompanyPayrollSummary
);

module.exports = router;
