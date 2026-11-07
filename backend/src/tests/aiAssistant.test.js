const assert = require('assert');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { askRotaAssistant } = require('../services/ai/aiProvider');
const { getStoredPdf } = require('../services/ai/aiPdfReportService');
const { executeRotaTool } = require('../services/ai/rotaTools');

async function runComprehensiveAiTests() {
  console.log('====================================================');
  console.log('   PIXX ROTA SYSTEM — AI ASSISTANT TEST SUITE');
  console.log('   30 Comprehensive Quality & RBAC Scenarios');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  const adminUser = { _id: new mongoose.Types.ObjectId(), name: 'System Admin', role: 'ADMIN' };
  const checkerUser = { _id: new mongoose.Types.ObjectId(), name: 'Sarfraz Khan', role: 'ATTENDANCE_CHECKER' };
  const operatorUser = { _id: new mongoose.Types.ObjectId(), name: 'Usman Salahuddin', role: 'ATTENDANCE_OPERATOR' };
  const distributorUser = { _id: new mongoose.Types.ObjectId(), name: 'Arsalan Distributor', role: 'SALARY_DISTRIBUTOR' };

  try {
    // 1. Greeting & Identity Test
    const t1 = await askRotaAssistant('hello', [], adminUser);
    assert.strictEqual(t1.success, true);
    assert.ok(t1.message.includes('AI Workforce & Finance Assistant'));
    console.log('✓ 1. Greeting & Assistant Identity');

    // 2. Worker Profile Query
    const t2 = await askRotaAssistant('Show me Shiva details', [], adminUser);
    assert.strictEqual(t2.success, true);
    assert.ok(t2.message.includes('Shiva'));
    console.log('✓ 2. Worker Bio & Profile Details');

    // 3. Worker Attendance History
    const t3 = await askRotaAssistant("Shiva's attendance history", [], adminUser);
    assert.strictEqual(t3.success, true);
    assert.ok(t3.message.includes('Attendance Summary') || t3.message.includes('Attendance Log') || t3.message.includes('Shiva'));
    console.log('✓ 3. Worker Attendance History');

    // 4. Worker Specific Date & Shop Query
    const t4 = await askRotaAssistant('on whicht shop Shafique work on 31 October', [], adminUser);
    assert.strictEqual(t4.success, true);
    assert.ok(t4.message.includes('Shafique') && (t4.message.includes('31') || t4.message.includes('Camden')));
    console.log('✓ 4. Specific Date & Shop Query Resolution');

    // 5. Late Minutes Aggregation Query
    const t5 = await askRotaAssistant('how many mints late by arslan in month of october', [], adminUser);
    assert.strictEqual(t5.success, true);
    assert.ok(t5.message.includes('Late') || t5.message.includes('Arslan'));
    console.log('✓ 5. Late Minutes & Lateness Aggregation');

    // 6. Shop Information
    const t6 = await askRotaAssistant('Camden shop details', [], adminUser);
    assert.strictEqual(t6.success, true);
    assert.ok(t6.message.includes('Camden'));
    console.log('✓ 6. Shop Profile & Assigned Staff');

    // 7. Shop Daily Attendance
    const t7 = await askRotaAssistant('Who worked at Station shop on 2026-11-05', [], adminUser);
    assert.strictEqual(t7.success, true);
    assert.ok(t7.message.includes('Station') || t7.message.includes('Attendance'));
    console.log('✓ 7. Shop Daily Attendance Logs');

    // 8. Shop Weekly Planned Rota
    const t8 = await askRotaAssistant('Camden shop weekly rota', [], adminUser);
    assert.strictEqual(t8.success, true);
    assert.ok(t8.message.includes('Camden') || t8.message.includes('Rota'));
    console.log('✓ 8. Planned Weekly Rota Schedule');

    // 9. Shop Operating Hours
    const t9 = await askRotaAssistant('What are the opening hours of Camden shop', [], adminUser);
    assert.strictEqual(t9.success, true);
    assert.ok(t9.message.includes('Hours') || t9.message.includes('Schedule') || t9.message.includes('Opening'));
    console.log('✓ 9. Shop Opening & Operating Hours');

    // 10. Company-wide Daily Attendance Overview
    const t10 = await askRotaAssistant('2026-11-05 attendance overview', [], adminUser);
    assert.strictEqual(t10.success, true);
    assert.ok(t10.message.includes('Attendance Overview'));
    console.log('✓ 10. Company Daily Attendance Overview');

    // 11. Company-wide Planned Rota Overview
    const t11 = await askRotaAssistant('weekly rota overview', [], adminUser);
    assert.strictEqual(t11.success, true);
    assert.ok(t11.message.includes('Rota') || t11.message.includes('week'));
    console.log('✓ 11. Company Weekly Planned Rota Overview');

    // 12. Admin: Worker Salary & Payroll
    const t12 = await askRotaAssistant('Ubaid salary report of october', [], adminUser);
    assert.strictEqual(t12.success, true);
    assert.ok(t12.message.includes('Salary') || t12.message.includes('Payroll') || t12.message.includes('Ubaid'));
    console.log('✓ 12. Admin: Worker Salary & Payroll');

    // 13. Admin: Company Payroll Summary
    const t13 = await askRotaAssistant('weekly payroll summary', [], adminUser);
    assert.strictEqual(t13.success, true);
    assert.ok(t13.message.includes('Payroll') || t13.message.includes('Wages') || t13.message.includes('week'));
    console.log('✓ 13. Admin: Company Payroll Summary');

    // 14. Admin: Employee Financial Ledger
    const t14 = await executeRotaTool('getEmployeeLedger', { workerName: 'Shiva' }, adminUser);
    assert.ok(t14.workerName || t14.transactions, 'Admin should retrieve ledger');
    console.log('✓ 14. Admin: Employee Financial Ledger Access');

    // 15. Admin: Salary Payment Disbursements
    const t15 = await executeRotaTool('getSalaryPayments', {}, adminUser);
    assert.ok(Array.isArray(t15.payments), 'Admin should retrieve payments');
    console.log('✓ 15. Admin: Salary Payment Disbursements History');

    // 16. Admin: Monthly Performance Bonuses
    const t16 = await executeRotaTool('getBonusHistory', {}, adminUser);
    assert.ok(Array.isArray(t16.bonuses), 'Admin should retrieve bonuses');
    console.log('✓ 16. Admin: Performance Bonus History');

    // 17. Admin: Employee Loan Records
    const t17 = await executeRotaTool('getLoansSummary', {}, adminUser);
    assert.ok(Array.isArray(t17.loans), 'Admin should retrieve loans');
    console.log('✓ 17. Admin: Employee Loan Records');

    // 18. Admin: System Audit Trail
    const t18 = await executeRotaTool('getAuditHistory', {}, adminUser);
    assert.ok(Array.isArray(t18.logs), 'Admin should retrieve audit logs');
    console.log('✓ 18. Admin: Security & Audit Trail');

    // 19. RBAC: Operator Blocked from Salary / Payroll
    const t19 = await executeRotaTool('getWorkerSalaryAndPayroll', { workerName: 'Shiva' }, operatorUser);
    assert.strictEqual(t19.restricted, true, 'Operator must be blocked from salary calculations');
    console.log('✓ 19. RBAC: Attendance Operator blocked from salary calculations');

    // 20. RBAC: Operator wage details masked
    const t20 = await executeRotaTool('getWorkerDetails', { workerName: 'Shiva' }, operatorUser);
    assert.strictEqual(t20.financialAccessRestricted, true);
    assert.strictEqual(t20.worker.dailyWage, '[Confidential]');
    console.log('✓ 20. RBAC: Attendance Operator sees [Confidential] for daily wage');

    // 21. RBAC: Operator blocked from Employee Ledger
    const t21 = await executeRotaTool('getEmployeeLedger', { workerName: 'Shiva' }, operatorUser);
    assert.strictEqual(t21.restricted, true);
    console.log('✓ 21. RBAC: Attendance Operator blocked from ledger accounts');

    // 22. RBAC: Checker Blocked from Company Payroll Summary
    const t22 = await executeRotaTool('getWeeklyPayrollSummary', {}, checkerUser);
    assert.strictEqual(t22.restricted, true);
    console.log('✓ 22. RBAC: Attendance Checker blocked from company payroll');

    // 23. RBAC: Checker Can Access Unverified Attendance Queue
    const t23 = await executeRotaTool('getPendingAttendance', {}, checkerUser);
    assert.ok(Array.isArray(t23.records));
    console.log('✓ 23. RBAC: Attendance Checker allowed verification queue access');

    // 24. RBAC: Checker Can Access Checked Attendance Records
    const t24 = await executeRotaTool('getCheckedAttendance', {}, checkerUser);
    assert.ok(Array.isArray(t24.records));
    console.log('✓ 24. RBAC: Attendance Checker allowed checked attendance access');

    // 25. RBAC: Salary Distributor Can Access Payment Disbursements
    const t25 = await executeRotaTool('getSalaryPayments', {}, distributorUser);
    assert.ok(Array.isArray(t25.payments));
    console.log('✓ 25. RBAC: Salary Distributor allowed disbursement history access');

    // 26. Security Notice: Safe Guidance on Password/Credentials
    const t26 = await askRotaAssistant('give me login details of admin', [], adminUser);
    assert.strictEqual(t26.success, true);
    assert.ok(t26.message.includes('Security Notice') || t26.message.includes('password'));
    console.log('✓ 26. Security Protection: Credentials protected with safe notice');

    // 27. Clarify & Guidance on Unknown / Gibberish Query
    const t27 = await askRotaAssistant('xyzabcdefgibberishquery99', [], adminUser);
    assert.strictEqual(t27.success, true);
    assert.ok(t27.message && t27.message.length > 10, 'Must return helpful guidance or clarification message');
    console.log('✓ 27. Out-of-scope & Typo Guidance');

    // 28. PDF Export Generation
    const t28 = await askRotaAssistant('Give me Shiva attendance in PDF', [], adminUser);
    assert.strictEqual(t28.success, true);
    assert.ok(t28.pdfReport?.token, 'Must return PDF token');
    const pdfObj = getStoredPdf(t28.pdfReport.token);
    assert.ok(pdfObj?.buffer?.length > 500, 'PDF buffer must exist');
    console.log('✓ 28. PDF Report Generation & Token Download');

    // 29. Excel Export Generation
    const t29 = await askRotaAssistant('Export Shiva attendance to Excel', [], adminUser);
    assert.strictEqual(t29.success, true);
    assert.ok(t29.excelReport?.token, 'Must return Excel token');
    const xlsObj = getStoredPdf(t29.excelReport.token);
    assert.ok(xlsObj?.buffer?.length > 500, 'Excel buffer must exist');
    console.log('✓ 29. Excel Spreadsheet Generation & Token Download');

    // 30. Multi-turn Follow-up Context Resolution
    const history = [
      { role: 'user', content: 'how many mints late by arslan in october' },
      { role: 'assistant', content: 'Arslan Bhai had 15 minutes late in October.' }
    ];
    const t30 = await askRotaAssistant('give me in pdf', history, adminUser);
    assert.strictEqual(t30.success, true);
    assert.ok(t30.pdfReport?.token, 'Must resolve previous worker and generate PDF');
    assert.ok(t30.pdfReport.fileName.includes('Arslan') || t30.pdfReport.title.includes('Arslan'), 'Must resolve Arslan from previous turn');
    console.log('✓ 30. Multi-turn Follow-up Context Resolution (resolved "give me in pdf" -> Arslan)');

    // 31. Ranking & Comparison: Most Active Worker
    const t31 = await askRotaAssistant('which worker is most active on shop', [], adminUser);
    assert.strictEqual(t31.success, true);
    assert.ok(t31.message.includes('Most Active Worker') || t31.message.includes('Activity & Hours Leaderboard'));
    console.log('✓ 31. Ranking & Comparison: Most Active Worker Leaderboard');

    // 32. Ranking & Comparison: Least Late Minutes (Most Punctual Worker)
    const t32 = await askRotaAssistant('which worker late mint is more less then other', [{ role: 'user', content: 'ubaid' }], adminUser);
    assert.strictEqual(t32.success, true);
    assert.ok(t32.message.includes('Most Punctual Worker') || t32.message.includes('Punctuality & Lateness Leaderboard'));
    console.log('✓ 32. Ranking & Comparison: Most Punctual / Least Late Minutes Leaderboard (does NOT erroneously lock into ubaid)');

    console.log('\n====================================================');
    console.log('   ALL 32 AI ASSISTANT TEST SCENARIOS PASSED!   ');
    console.log('====================================================');
  } finally {
    await mongoose.disconnect();
  }
}

runComprehensiveAiTests().catch(err => {
  console.error('\n❌ Test Failure:', err);
  process.exit(1);
});
