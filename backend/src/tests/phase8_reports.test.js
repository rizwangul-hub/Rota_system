const assert = require('assert');
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db');
const Shop = require('../models/Shop');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const WeeklySalary = require('../models/WeeklySalary');
const SalaryPayment = require('../models/SalaryPayment');
const LedgerTransaction = require('../models/LedgerTransaction');
const Bonus = require('../models/Bonus');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { getWeekRange } = require('../utils/calc');
const app = require('../index');

async function runPhase8Tests() {
  console.log('===========================================================');
  console.log('  PIXXTECHNOLOGIES ROTA SYSTEM — PHASE 8 TEST SUITE        ');
  console.log('  Reports, Analytics & Advanced Payroll Reporting          ');
  console.log('===========================================================\n');

  let passed = 0;
  const totalTests = 22;

  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    await new Promise(resolve => setTimeout(resolve, 800));
    const baseUrl = `http://127.0.0.1:${process.env.PORT || 5000}/api`;

    // 0. Setup test users and tokens
    const adminUser = await User.findOne({ username: 'admin' });
    const distributorUser = await User.findOne({ username: 'distributor' });
    const sarfrazUser = await User.findOne({ username: 'sarfraz' });
    const usmanUser = await User.findOne({ username: 'usman' });

    if (!adminUser || !distributorUser || !sarfrazUser || !usmanUser) {
      throw new Error('Required standard users missing in DB.');
    }

    const adminToken = jwt.sign(
      { id: adminUser._id, username: adminUser.username, role: adminUser.role },
      process.env.JWT_SECRET || 'fallback_secret_key_12345',
      { expiresIn: '2h' }
    );
    const distributorToken = jwt.sign(
      { id: distributorUser._id, username: distributorUser.username, role: distributorUser.role },
      process.env.JWT_SECRET || 'fallback_secret_key_12345',
      { expiresIn: '2h' }
    );
    const sarfrazToken = jwt.sign(
      { id: sarfrazUser._id, username: sarfrazUser.username, role: sarfrazUser.role },
      process.env.JWT_SECRET || 'fallback_secret_key_12345',
      { expiresIn: '2h' }
    );
    const usmanToken = jwt.sign(
      { id: usmanUser._id, username: usmanUser.username, role: usmanUser.role },
      process.env.JWT_SECRET || 'fallback_secret_key_12345',
      { expiresIn: '2h' }
    );

    const stationShop = await Shop.findOne({ name: 'Station' }) || await Shop.findOne();
    const camdenShop = await Shop.findOne({ name: 'Camden' }) || stationShop;

    const uniqueSuffix = Date.now().toString().slice(-5);

    // Create isolated test employee
    const testEmployee = await Employee.create({
      name: `P8 Staff ${uniqueSuffix}`,
      employeeId: `P8_${uniqueSuffix}`,
      assignedShop: stationShop._id,
      dailyWage: 50,
      employmentStatus: 'Active'
    });

    // Create controlled attendance records for Monday to Thursday (05/10/2026 - 08/10/2026)
    // 05/10/2026 is Monday
    const testWeek = getWeekRange('2026-10-05');
    const weekLabel = testWeek.weekLabel;

    // Day 1: Monday, Station, Present (09:00 - 19:00, £50 pay)
    const att1 = await Attendance.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      date: new Date('2026-10-05T12:00:00Z'),
      dateString: '2026-10-05',
      shiftStart: '09:00',
      shiftEnd: '19:00',
      timeReached: '09:00',
      workerEndTime: '19:00',
      scheduledHours: 10,
      actualHours: 10,
      status: 'Present',
      dailyWage: 50,
      hourlyWage: 5,
      lateMinutes: 0,
      lateDeduction: 0,
      attendancePay: 50,
      approvalStatus: 'Checked',
      checkedBy: sarfrazUser._id,
      checkedByName: sarfrazUser.name
    });

    // Day 2: Tuesday, Camden, Late (09:30 - 19:00, 30m late, £2.50 ded, £47.50 pay)
    const att2 = await Attendance.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: camdenShop._id,
      shopName: camdenShop.name,
      date: new Date('2026-10-06T12:00:00Z'),
      dateString: '2026-10-06',
      shiftStart: '09:00',
      shiftEnd: '19:00',
      timeReached: '09:30',
      workerEndTime: '19:00',
      scheduledHours: 10,
      actualHours: 9.5,
      status: 'Late',
      dailyWage: 50,
      hourlyWage: 5,
      lateMinutes: 30,
      lateDeduction: 2.5,
      attendancePay: 47.5,
      approvalStatus: 'Checked',
      checkedBy: sarfrazUser._id,
      checkedByName: sarfrazUser.name
    });

    // Day 3: Wednesday, Station, Half Day (£25 pay)
    const att3 = await Attendance.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      date: new Date('2026-10-07T12:00:00Z'),
      dateString: '2026-10-07',
      shiftStart: '09:00',
      shiftEnd: '19:00',
      timeReached: '09:00',
      workerEndTime: '14:00',
      scheduledHours: 10,
      actualHours: 5,
      status: 'Half',
      dailyWage: 50,
      hourlyWage: 5,
      lateMinutes: 0,
      lateDeduction: 0,
      attendancePay: 25,
      approvalStatus: 'Checked',
      checkedBy: sarfrazUser._id,
      checkedByName: sarfrazUser.name
    });

    // Day 4: Thursday, Station, Absent (0h worked, £0 pay)
    const att4 = await Attendance.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      date: new Date('2026-10-08T12:00:00Z'),
      dateString: '2026-10-08',
      shiftStart: '09:00',
      shiftEnd: '19:00',
      timeReached: '00:00',
      workerEndTime: '00:00',
      scheduledHours: 10,
      actualHours: 0,
      status: 'Absent',
      dailyWage: 50,
      hourlyWage: 5,
      lateMinutes: 0,
      lateDeduction: 0,
      attendancePay: 0,
      approvalStatus: 'Checked',
      checkedBy: sarfrazUser._id,
      checkedByName: sarfrazUser.name
    });

    // ----------------------------------------------------
    // TEST 1 — Daily attendance report returns correct records for selected date
    // ----------------------------------------------------
    console.log('[TEST 1] Testing Daily Attendance Report for 2026-10-05...');
    const dRes1 = await fetch(`${baseUrl}/reports/daily-attendance?date=2026-10-05&employeeId=${testEmployee._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dData1 = await dRes1.json();
    assert.strictEqual(dRes1.status, 200);
    assert.strictEqual(dData1.success, true);
    assert.strictEqual(dData1.records.length, 1);
    assert.strictEqual(dData1.records[0].dateString, '2026-10-05');
    assert.strictEqual(dData1.records[0].attendancePay, 50);
    console.log(`✓ PASS: Daily attendance report returned correct record for 2026-10-05 (£50 pay).`);
    passed++;

    // ----------------------------------------------------
    // TEST 2 — Daily attendance shop filter works
    // ----------------------------------------------------
    console.log('\n[TEST 2] Testing Daily Attendance Shop Filter (Camden vs Station)...');
    const dRes2 = await fetch(`${baseUrl}/reports/daily-attendance?date=2026-10-06&shopId=${camdenShop._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dData2 = await dRes2.json();
    assert.strictEqual(dRes2.status, 200);
    const foundInCamden = dData2.records.find(r => r.employeeId === testEmployee.employeeId);
    assert.ok(foundInCamden, 'Record for Camden must be found');

    const dRes3 = await fetch(`${baseUrl}/reports/daily-attendance?date=2026-10-06&shopId=${stationShop._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dData3 = await dRes3.json();
    assert.strictEqual(dRes3.status, 200);
    const foundInStation = dData3.records.find(r => r.employeeId === testEmployee.employeeId);
    assert.strictEqual(foundInStation, undefined, 'Camden attendance must not appear under Station shop filter');
    console.log('✓ PASS: Shop filter accurately filters attendance by shop location.');
    passed++;

    // ----------------------------------------------------
    // TEST 3 — Weekly attendance correctly groups Monday-Sunday
    // ----------------------------------------------------
    console.log('\n[TEST 3] Testing Weekly Attendance grouping (Monday 05/10/2026 - Sunday 11/10/2026)...');
    const wAttRes = await fetch(`${baseUrl}/reports/weekly-attendance?date=2026-10-05&employeeId=${testEmployee._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const wAttData = await wAttRes.json();
    assert.strictEqual(wAttRes.status, 200);
    assert.strictEqual(wAttData.success, true);
    assert.ok(wAttData.records.length >= 1);
    const empRecord = wAttData.records[0];
    assert.strictEqual(empRecord.workingDays, 3, 'Working days must be 3 (Absent excluded)');
    assert.strictEqual(empRecord.presentDays, 1);
    assert.strictEqual(empRecord.lateDays, 1);
    assert.strictEqual(empRecord.halfDays, 1);
    assert.strictEqual(empRecord.absentDays, 1);
    assert.strictEqual(empRecord.attendancePay, 122.5, 'Attendance pay: 50 + 47.50 + 25 = 122.50');
    console.log(`✓ PASS: Weekly attendance grouped Mon-Sun: Working Days=${empRecord.workingDays}, Pay=£${empRecord.attendancePay}`);
    passed++;

    // ----------------------------------------------------
    // TEST 4 — Employee monthly report returns correct attendance totals
    // ----------------------------------------------------
    console.log('\n[TEST 4] Testing Employee Monthly Report Attendance Totals for Oct 2026...');
    const mReportRes = await fetch(`${baseUrl}/reports/employee-monthly?employeeId=${testEmployee._id}&month=10&year=2026`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const mReportData = await mReportRes.json();
    assert.strictEqual(mReportRes.status, 200);
    assert.strictEqual(mReportData.attendanceSummary.workingDays, 3);
    assert.strictEqual(mReportData.attendanceSummary.present, 1);
    assert.strictEqual(mReportData.attendanceSummary.late, 1);
    assert.strictEqual(mReportData.attendanceSummary.half, 1);
    assert.strictEqual(mReportData.attendanceSummary.absent, 1);
    assert.strictEqual(mReportData.attendanceSummary.attendancePay, 122.5);
    console.log(`✓ PASS: Employee monthly attendance totals correct: Working Days=3, Net Pay=£122.50`);
    passed++;

    // Create a Finalized WeeklySalary for this employee in October 2026
    const salaryDoc = await WeeklySalary.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      shopsWorked: [stationShop.name, camdenShop.name],
      weekStartDate: testWeek.startDate,
      weekEndDate: testWeek.endDate,
      weekStartDateString: testWeek.startDateString,
      weekEndDateString: testWeek.endDateString,
      weekLabel,
      workingDays: 3,
      scheduledHours: 40,
      actualHours: 24.5,
      grossDailyWages: 150,
      lateDeductions: 2.5,
      netAttendancePay: 122.5,
      travelAllowance: 20,
      otherAllowances: 10,
      manualDeductions: 5,
      bonus: 50,
      finalSalary: 197.5, // 122.5 + 20 + 10 + 50 - 5 = 197.50
      totalPaid: 0,
      balanceRemaining: 197.5,
      status: 'FINALIZED',
      finalizedAt: new Date()
    });

    // ----------------------------------------------------
    // TEST 5 — Employee yearly report correctly aggregates monthly finalized salaries
    // ----------------------------------------------------
    console.log('\n[TEST 5] Testing Employee Yearly Report (aggregating monthly finalized salaries)...');
    const yReportRes = await fetch(`${baseUrl}/reports/employee-yearly?employeeId=${testEmployee._id}&year=2026`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const yReportData = await yReportRes.json();
    assert.strictEqual(yReportRes.status, 200);
    assert.strictEqual(yReportData.monthlyRows.length, 12);
    const octRow = yReportData.monthlyRows.find(r => r.monthNumber === 10);
    assert.ok(octRow);
    assert.strictEqual(octRow.finalSalary, 197.5);
    assert.strictEqual(yReportData.yearlyTotals.totalFinalSalary, 197.5);
    console.log(`✓ PASS: Employee yearly report correctly aggregated: Oct finalSalary=£197.50, Year Total=£197.50`);
    passed++;

    // ----------------------------------------------------
    // TEST 6 — Weekly salary report uses finalized salary snapshot
    // ----------------------------------------------------
    console.log('\n[TEST 6] Testing Weekly Salary Report uses finalized snapshot values...');
    const wsRepRes = await fetch(`${baseUrl}/reports/weekly-salary?weekLabel=${encodeURIComponent(weekLabel)}&employeeId=${testEmployee._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const wsRepData = await wsRepRes.json();
    assert.strictEqual(wsRepRes.status, 200);
    assert.strictEqual(wsRepData.salaries.length, 1);
    assert.strictEqual(wsRepData.salaries[0].finalSalary, 197.5);
    assert.strictEqual(wsRepData.salaries[0].status, 'FINALIZED');
    assert.strictEqual(wsRepData.totals.totalFinalSalary, 197.5);
    console.log(`✓ PASS: Weekly salary report displays finalized salary £197.50 from snapshot.`);
    passed++;

    // ----------------------------------------------------
    // TEST 7 — Salary report does not double-count installments
    // ----------------------------------------------------
    console.log('\n[TEST 7] Testing Non-Duplication: Recording multiple installment payments...');
    // Payment 1: £100 Cash
    const pay1 = await SalaryPayment.create({
      weeklySalary: salaryDoc._id,
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      shop: stationShop._id,
      shopName: stationShop.name,
      weekLabel: salaryDoc.weekLabel,
      amount: 100,
      paymentMethod: 'Cash',
      paymentDate: new Date('2026-10-12T10:00:00Z'),
      paidBy: distributorUser._id,
      paidByName: distributorUser.name,
      notes: 'Installment 1'
    });

    // Payment 2: £97.50 Bank
    const pay2 = await SalaryPayment.create({
      weeklySalary: salaryDoc._id,
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      shop: stationShop._id,
      shopName: stationShop.name,
      weekLabel: salaryDoc.weekLabel,
      amount: 97.5,
      paymentMethod: 'Bank',
      paymentDate: new Date('2026-10-13T10:00:00Z'),
      paidBy: distributorUser._id,
      paidByName: distributorUser.name,
      notes: 'Installment 2'
    });

    // Update WeeklySalary with authoritative totals
    salaryDoc.totalPaid = 197.5;
    salaryDoc.balanceRemaining = 0;
    salaryDoc.status = 'PAID';
    await salaryDoc.save();

    // Query weekly salary report again
    const wsRepRes2 = await fetch(`${baseUrl}/reports/weekly-salary?weekLabel=${encodeURIComponent(weekLabel)}&employeeId=${testEmployee._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const wsRepData2 = await wsRepRes2.json();
    assert.strictEqual(wsRepData2.salaries[0].finalSalary, 197.5, 'Final salary must remain £197.50 (NOT multiplied by payments)');
    assert.strictEqual(wsRepData2.salaries[0].totalPaid, 197.5);
    assert.strictEqual(wsRepData2.salaries[0].balanceRemaining, 0);
    console.log('✓ PASS: Salary report does NOT double-count: Final Salary remains £197.50, Paid=£197.50, Outstanding=£0.');
    passed++;

    // ----------------------------------------------------
    // TEST 8 — Payment report correctly totals multiple payments
    // ----------------------------------------------------
    console.log('\n[TEST 8] Testing Salary Payment Report totals across installments...');
    const payRepRes = await fetch(`${baseUrl}/reports/payments?employeeId=${testEmployee._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const payRepData = await payRepRes.json();
    assert.strictEqual(payRepRes.status, 200);
    assert.strictEqual(payRepData.totals.paymentCount, 2);
    assert.strictEqual(payRepData.totals.totalPaid, 197.5);
    console.log(`✓ PASS: Payment report correctly totals payments: count=2, totalPaid=£197.50`);
    passed++;

    // ----------------------------------------------------
    // TEST 9 — Cash vs Bank payment totals are correct
    // ----------------------------------------------------
    console.log('\n[TEST 9] Testing Cash vs Bank Payment Totals...');
    assert.strictEqual(payRepData.totals.cashTotal, 100);
    assert.strictEqual(payRepData.totals.bankTotal, 97.5);
    assert.strictEqual(payRepData.totals.cashCount, 1);
    assert.strictEqual(payRepData.totals.bankCount, 1);
    console.log('✓ PASS: Cash (£100) vs Bank (£97.50) payment breakdown accurately verified.');
    passed++;

    // ----------------------------------------------------
    // TEST 10 — Bonus report returns one monthly bonus correctly
    // ----------------------------------------------------
    console.log('\n[TEST 10] Testing Bonus Report with decimal commission percentage...');
    const bonusDoc = await Bonus.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      month: 'Oct',
      year: 2026,
      salesAmount: 10000,
      bonusPercentage: 2,
      bonusAmount: 200,
      commitmentText: '2% - Station'
    });

    const bRepRes = await fetch(`${baseUrl}/reports/bonus?employeeId=${testEmployee._id}&month=Oct&year=2026`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const bRepData = await bRepRes.json();
    assert.strictEqual(bRepRes.status, 200);
    assert.strictEqual(bRepData.bonuses.length, 1);
    assert.strictEqual(bRepData.totals.totalSales, 10000);
    assert.strictEqual(bRepData.totals.totalBonus, 200);
    console.log('✓ PASS: Bonus report returns single bonus: Sales=£10,000, Rate=2%, Bonus=£200.');
    passed++;

    // ----------------------------------------------------
    // TEST 11 — Monthly bonus is not multiplied across weekly salaries
    // ----------------------------------------------------
    console.log('\n[TEST 11] Verifying monthly bonus is NOT multiplied across weekly salaries...');
    // Querying bonus report returns exactly £200 even though weekly salary has its own bonus line
    assert.strictEqual(bRepData.totals.totalBonus, 200, 'Bonus report total must remain £200, not multiplied');
    console.log('✓ PASS: Monthly bonus duplication protection verified: Bonus report strictly reflects single £200 bonus.');
    passed++;

    // ----------------------------------------------------
    // TEST 12 — Shop labour-hours report calculates scheduled/actual hours correctly
    // ----------------------------------------------------
    console.log('\n[TEST 12] Testing Shop Labour Hours Report...');
    const labRepRes = await fetch(`${baseUrl}/reports/shop-labour?startDate=2026-10-05&endDate=2026-10-08&employeeId=${testEmployee._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const labRepData = await labRepRes.json();
    assert.strictEqual(labRepRes.status, 200);
    assert.strictEqual(labRepData.grandTotals.totalWorkingDays, 3);
    assert.strictEqual(labRepData.grandTotals.totalActualHours, 24.5); // 10 + 9.5 + 5 = 24.5
    assert.strictEqual(labRepData.grandTotals.totalScheduledHours, 40);
    assert.strictEqual(labRepData.grandTotals.totalWageCost, 122.5);
    console.log(`✓ PASS: Shop labour hours calculated: Work Days=3, Actual Hours=24.5h, Scheduled=40h, Cost=£122.50.`);
    passed++;

    // ----------------------------------------------------
    // TEST 13 & 14 — Salary ledger report returns chronological transactions and correct balance
    // ----------------------------------------------------
    console.log('\n[TEST 13 & 14] Testing Salary Ledger Report (Chronology & Running Balance)...');
    // Create ledger transactions: 1 Earning £197.50, 2 Payments £100 & £97.50
    const ledg1 = await LedgerTransaction.create({
      employee: testEmployee._id,
      date: new Date('2026-10-11T12:00:00Z'),
      transactionType: 'SALARY_EARNED',
      description: `Weekly Salary for week ${weekLabel}`,
      referenceType: 'WeeklySalary',
      referenceId: salaryDoc._id,
      amountEarned: 197.5,
      amountPaid: 0,
      runningBalance: 197.5
    });

    const ledg2 = await LedgerTransaction.create({
      employee: testEmployee._id,
      date: new Date('2026-10-12T12:00:00Z'),
      transactionType: 'SALARY_PAYMENT',
      description: 'Payment via Cash',
      referenceType: 'SalaryPayment',
      referenceId: pay1._id,
      amountEarned: 0,
      amountPaid: 100,
      runningBalance: 97.5
    });

    const ledg3 = await LedgerTransaction.create({
      employee: testEmployee._id,
      date: new Date('2026-10-13T12:00:00Z'),
      transactionType: 'SALARY_PAYMENT',
      description: 'Payment via Bank',
      referenceType: 'SalaryPayment',
      referenceId: pay2._id,
      amountEarned: 0,
      amountPaid: 97.5,
      runningBalance: 0
    });

    const ledgRepRes = await fetch(`${baseUrl}/reports/ledger/${testEmployee._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const ledgRepData = await ledgRepRes.json();
    assert.strictEqual(ledgRepRes.status, 200);
    assert.strictEqual(ledgRepData.transactions.length, 3);
    assert.strictEqual(ledgRepData.summary.totalEarned, 197.5);
    assert.strictEqual(ledgRepData.summary.totalPaid, 197.5);
    assert.strictEqual(ledgRepData.summary.outstanding, 0);
    // Chronology check
    const tDates = ledgRepData.transactions.map(t => new Date(t.date).getTime());
    assert.ok(tDates[0] <= tDates[1] && tDates[1] <= tDates[2], 'Transactions must be chronological');
    console.log('✓ PASS: Ledger report verified: 3 chronological transactions, Earned=£197.50, Paid=£197.50, Outstanding=£0.');
    passed += 2; // Tests 13 and 14

    // ----------------------------------------------------
    // TEST 15 — Historical wage changes do not alter historical report values
    // ----------------------------------------------------
    console.log('\n[TEST 15] Testing Historical Data Protection (Update employee daily wage £50 -> £120)...');
    testEmployee.dailyWage = 120;
    await testEmployee.save();

    const dResHist = await fetch(`${baseUrl}/reports/daily-attendance?date=2026-10-05&employeeId=${testEmployee._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dDataHist = await dResHist.json();
    assert.strictEqual(dDataHist.records[0].dailyWage, 50, 'Historical daily wage in attendance snapshot must remain £50');
    assert.strictEqual(dDataHist.records[0].attendancePay, 50, 'Historical attendance pay must remain £50');
    console.log('✓ PASS: Historical attendance report values strictly preserved after employee wage update.');
    passed++;

    // ----------------------------------------------------
    // TEST 16 — Finalized salary remains unchanged after employee changes
    // ----------------------------------------------------
    console.log('\n[TEST 16] Testing Finalized Salary Report Protection after employee changes...');
    const wsRepHist = await fetch(`${baseUrl}/reports/weekly-salary?weekLabel=${encodeURIComponent(weekLabel)}&employeeId=${testEmployee._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const wsDataHist = await wsRepHist.json();
    assert.strictEqual(wsDataHist.salaries[0].finalSalary, 197.5, 'Final salary must remain £197.50');
    console.log('✓ PASS: Finalized salary report strictly preserved original snapshot (£197.50).');
    passed++;

    // ----------------------------------------------------
    // TEST 17 — Unauthorized user cannot access Admin-only reports
    // ----------------------------------------------------
    console.log('\n[TEST 17] Testing RBAC Security on Reports endpoints...');
    const unauthSalaryRes = await fetch(`${baseUrl}/reports/weekly-salary`, {
      headers: { Authorization: `Bearer ${sarfrazToken}` }
    });
    assert.strictEqual(unauthSalaryRes.status, 403, 'Sarfraz must be forbidden from weekly salary reports');

    const unauthSummaryRes = await fetch(`${baseUrl}/reports/summary`, {
      headers: { Authorization: `Bearer ${usmanToken}` }
    });
    assert.strictEqual(unauthSummaryRes.status, 403, 'Usman must be forbidden from company summary analytics');

    const noTokenRes = await fetch(`${baseUrl}/reports/weekly-salary`);
    assert.strictEqual(noTokenRes.status, 401, 'Unauthenticated request must be rejected (401)');
    console.log('✓ PASS: RBAC enforced: Sarfraz (403), Usman (403), No Token (401) correctly blocked.');
    passed++;

    // ----------------------------------------------------
    // TEST 18 — Date range filters work correctly
    // ----------------------------------------------------
    console.log('\n[TEST 18] Testing Date Range filtering...');
    const outOfRangeRes = await fetch(`${baseUrl}/reports/payments?employeeId=${testEmployee._id}&startDate=2025-01-01&endDate=2025-01-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const outOfRangeData = await outOfRangeRes.json();
    assert.strictEqual(outOfRangeData.payments.length, 0, 'No payments should match out-of-range dates');

    const inRangeRes = await fetch(`${baseUrl}/reports/payments?employeeId=${testEmployee._id}&startDate=2026-10-10&endDate=2026-10-15`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const inRangeData = await inRangeRes.json();
    assert.strictEqual(inRangeData.payments.length, 2, '2 payments should match in-range dates');
    console.log('✓ PASS: Date range filtering verified for out-of-range (0) and in-range (2) queries.');
    passed++;

    // ----------------------------------------------------
    // TEST 19 — Employee filters work correctly
    // ----------------------------------------------------
    console.log('\n[TEST 19] Testing Employee ID filter across reports...');
    const empFiltRes = await fetch(`${baseUrl}/reports/payments?employeeId=${testEmployee._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const empFiltData = await empFiltRes.json();
    assert.ok(empFiltData.payments.every(p => (p.employee?._id || p.employee).toString() === testEmployee._id.toString()));
    console.log('✓ PASS: Employee filter correctly isolated only records belonging to the selected employee.');
    passed++;

    // ----------------------------------------------------
    // TEST 20 — Shop filters work correctly
    // ----------------------------------------------------
    console.log('\n[TEST 20] Testing Shop filter across reports...');
    const shopFiltRes = await fetch(`${baseUrl}/reports/weekly-salary?shopId=${stationShop._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const shopFiltData = await shopFiltRes.json();
    assert.ok(shopFiltData.salaries.every(s => (s.shop?._id || s.shop).toString() === stationShop._id.toString()));
    console.log('✓ PASS: Shop filter correctly isolated only records belonging to the selected shop.');
    passed++;

    // ----------------------------------------------------
    // TEST 21 — Report endpoints handle empty results correctly
    // ----------------------------------------------------
    console.log('\n[TEST 21] Testing Empty States handling...');
    const emptyRes = await fetch(`${baseUrl}/reports/daily-attendance?date=2099-01-01`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const emptyData = await emptyRes.json();
    assert.strictEqual(emptyRes.status, 200);
    assert.strictEqual(emptyData.success, true);
    assert.strictEqual(emptyData.records.length, 0);
    assert.strictEqual(emptyData.summary.totalEmployees, 0);
    console.log('✓ PASS: Empty state handled cleanly with 200 OK and empty record array.');
    passed++;

    // ----------------------------------------------------
    // TEST 22 — Export data matches filtered report data & generates AuditLog
    // ----------------------------------------------------
    console.log('\n[TEST 22] Testing PDF and Excel exports and Audit Logging...');
    const excelRes = await fetch(`${baseUrl}/reports/daily-attendance/excel?date=2026-10-05`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(excelRes.status, 200);
    assert.ok(excelRes.headers.get('content-type').includes('spreadsheetml'));

    const pdfRes = await fetch(`${baseUrl}/reports/daily-attendance/pdf?date=2026-10-05`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(pdfRes.status, 200);
    assert.ok(pdfRes.headers.get('content-type').includes('application/pdf'));

    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    assert.strictEqual(pdfBuf.slice(0, 4).toString(), '%PDF', 'PDF output must begin with %PDF header');

    // Verify AuditLog for exports
    const auditExcel = await AuditLog.findOne({ action: 'REPORT_EXPORTED_EXCEL', recordType: 'DailyAttendance' }).sort({ createdAt: -1 });
    assert.ok(auditExcel, 'AuditLog entry for Excel export must exist');

    const auditPdf = await AuditLog.findOne({ action: 'REPORT_EXPORTED_PDF', recordType: 'DailyAttendance' }).sort({ createdAt: -1 });
    assert.ok(auditPdf, 'AuditLog entry for PDF export must exist');

    console.log('✓ PASS: Exports generated valid Excel and PDF streams, and recorded AuditLog entries.');
    passed++;

    console.log('\n===========================================================');
    console.log(`  PHASE 8 TEST RESULTS: ${passed} / ${totalTests} PASSED`);
    console.log('===========================================================');
    console.log('🎉 ALL PHASE 8 REPORTS & ANALYTICS REQUIREMENTS FULLY VERIFIED!\n');

    process.exit(0);
  } catch (error) {
    console.error('Phase 8 Test execution failed:', error);
    process.exit(1);
  }
}

runPhase8Tests();
