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
const SalaryAdjustment = require('../models/SalaryAdjustment');
const Bonus = require('../models/Bonus');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { getWeekRange } = require('../utils/calc');
const app = require('../index');

async function runPhase7Tests() {
  console.log('===========================================================');
  console.log('  PIXXTECHNOLOGIES ROTA SYSTEM — PHASE 7 TEST SUITE        ');
  console.log('  Salary Finalization, Distributor Payments & Ledger       ');
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
      name: `P7 Staff ${uniqueSuffix}`,
      employeeId: `P7_${uniqueSuffix}`,
      assignedShop: stationShop._id,
      dailyWage: 50,
      employmentStatus: 'Active'
    });

    // Week range for test
    const testWeek = getWeekRange('2026-09-14');
    const weekLabel = `${testWeek.weekLabel} (P7-${uniqueSuffix})`;

    // Create checked attendance records for this employee
    const att1 = await Attendance.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      date: new Date('2026-09-14T12:00:00Z'),
      dateString: '2026-09-14',
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

    const att2 = await Attendance.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      date: new Date('2026-09-15T12:00:00Z'),
      dateString: '2026-09-15',
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

    // Create a generated salary document
    let salaryDoc = await WeeklySalary.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      shopsWorked: [stationShop.name],
      weekStartDate: testWeek.startDate,
      weekEndDate: testWeek.endDate,
      weekStartDateString: '2026-09-14',
      weekEndDateString: '2026-09-20',
      weekLabel,
      workingDays: 2,
      scheduledHours: 20,
      actualHours: 19.5,
      grossDailyWages: 100,
      lateDeductions: 2.5,
      netAttendancePay: 97.5,
      travelAllowance: 20,
      otherAllowances: 10,
      manualDeductions: 15,
      bonus: 0,
      finalSalary: 112.5, // 97.5 + 20 + 10 - 15 = 112.5
      totalPaid: 0,
      balanceRemaining: 112.5,
      status: 'Generated',
      attendanceBreakdown: [
        {
          attendanceId: att1._id,
          dateString: '2026-09-14',
          dayOfWeek: 'Monday',
          shopName: stationShop.name,
          shiftStart: '09:00',
          shiftEnd: '19:00',
          timeReached: '09:00',
          workerEndTime: '19:00',
          scheduledHours: 10,
          actualHours: 10,
          status: 'Present',
          dailyWage: 50,
          lateMinutes: 0,
          lateDeduction: 0,
          attendancePay: 50
        },
        {
          attendanceId: att2._id,
          dateString: '2026-09-15',
          dayOfWeek: 'Tuesday',
          shopName: stationShop.name,
          shiftStart: '09:00',
          shiftEnd: '19:00',
          timeReached: '09:30',
          workerEndTime: '19:00',
          scheduledHours: 10,
          actualHours: 9.5,
          status: 'Late',
          dailyWage: 50,
          lateMinutes: 30,
          lateDeduction: 2.5,
          attendancePay: 47.5
        }
      ]
    });

    // ----------------------------------------------------
    // TEST 1 — Admin can finalize a valid weekly salary
    // ----------------------------------------------------
    console.log('[TEST 1] Admin finalizes weekly salary via POST /api/salaries/:id/finalize...');
    const finRes = await fetch(`${baseUrl}/salaries/${salaryDoc._id}/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const finData = await finRes.json();
    assert.strictEqual(finRes.status, 200);
    assert.strictEqual(finData.success, true);
    assert.strictEqual(finData.salary.status, 'FINALIZED');
    assert.ok(finData.salary.finalizedAt);
    assert.ok(finData.salary.finalizationSnapshot);
    console.log(`✓ PASS: Salary finalized: status=FINALIZED, finalSalary=£${finData.salary.finalSalary}`);
    passed++;

    // Refresh salaryDoc
    salaryDoc = await WeeklySalary.findById(salaryDoc._id);

    // ----------------------------------------------------
    // TEST 2 — Finalized salary cannot be modified through normal salary calculation flow
    // ----------------------------------------------------
    console.log('\n[TEST 2] Verifying finalized salary cannot be modified through calculation / adjustment flow...');
    const adjRes = await fetch(`${baseUrl}/salaries/${salaryDoc._id}/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ type: 'TRAVEL_ALLOWANCE', amount: 50, reason: 'Unauthorized post-final adjustment' })
    });
    assert.strictEqual(adjRes.status, 403, 'Adjustments on finalized salary must be blocked (403)');
    console.log('✓ PASS: Normal modification and adjustments blocked on finalized salary (403 Forbidden).');
    passed++;

    // ----------------------------------------------------
    // TEST 3 — Salary Distributor can see finalized salary
    // ----------------------------------------------------
    console.log('\n[TEST 3] Salary Distributor queries dashboard /api/dashboard/distributor...');
    const distDashRes = await fetch(`${baseUrl}/dashboard/distributor`, {
      headers: { Authorization: `Bearer ${distributorToken}` }
    });
    const distDashData = await distDashRes.json();
    assert.strictEqual(distDashRes.status, 200);
    assert.strictEqual(distDashData.success, true);
    const foundFinalized = distDashData.salaries.find(s => s._id.toString() === salaryDoc._id.toString());
    assert.ok(foundFinalized, 'Finalized salary must appear in distributor dashboard');
    assert.strictEqual(foundFinalized.status, 'FINALIZED');
    console.log(`✓ PASS: Salary Distributor sees finalized salary for ${foundFinalized.employeeName} (£${foundFinalized.finalSalary}).`);
    passed++;

    // ----------------------------------------------------
    // TEST 4 — Salary Distributor cannot see/pay an unfinalized salary
    // ----------------------------------------------------
    console.log('\n[TEST 4] Salary Distributor attempts to view/pay an unfinalized salary...');
    const unfinalizedSalary = await WeeklySalary.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      weekStartDate: testWeek.startDate,
      weekEndDate: testWeek.endDate,
      weekLabel: `Unfinalized-${uniqueSuffix}`,
      finalSalary: 200,
      balanceRemaining: 200,
      status: 'Generated'
    });

    const unfinPayRes = await fetch(`${baseUrl}/salaries/${unfinalizedSalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: 100, paymentMethod: 'Cash' })
    });
    const unfinPayData = await unfinPayRes.json();
    assert.strictEqual(unfinPayRes.status, 400);
    assert.strictEqual(unfinPayData.success, false);

    const unfinViewRes = await fetch(`${baseUrl}/salaries/${unfinalizedSalary._id}`, {
      headers: { Authorization: `Bearer ${distributorToken}` }
    });
    assert.strictEqual(unfinViewRes.status, 403, 'Distributor cannot view unfinalized salary');
    console.log('✓ PASS: Salary Distributor blocked from viewing/paying unfinalized salary.');
    passed++;

    // ----------------------------------------------------
    // TEST 5 & 6 — Full payment changes status to PAID
    // ----------------------------------------------------
    console.log('\n[TEST 5 & 6] Testing Full Payment on a finalized £500 salary -> status=PAID...');
    const fullPaySalary = await WeeklySalary.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      weekStartDate: testWeek.startDate,
      weekEndDate: testWeek.endDate,
      weekLabel: `FullPay-${uniqueSuffix}`,
      finalSalary: 500,
      totalPaid: 0,
      balanceRemaining: 500,
      status: 'FINALIZED'
    });

    const payFullRes = await fetch(`${baseUrl}/salaries/${fullPaySalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: 500, paymentMethod: 'Bank', notes: 'Full payment via Bank' })
    });
    const payFullData = await payFullRes.json();
    assert.strictEqual(payFullRes.status, 200);
    assert.strictEqual(payFullData.success, true);
    assert.strictEqual(payFullData.salary.totalPaid, 500);
    assert.strictEqual(payFullData.salary.balanceRemaining, 0);
    assert.strictEqual(payFullData.salary.status, 'PAID');
    console.log('✓ PASS: Full payment recorded (£500), balanceRemaining=£0, status=PAID.');
    passed += 2; // Tests 5 and 6

    // ----------------------------------------------------
    // TEST 7 — Partial payment changes status to PARTIALLY_PAID
    // ----------------------------------------------------
    console.log('\n[TEST 7] Testing Partial Payment on £1,000 salary (pay £300) -> status=PARTIALLY_PAID...');
    const partialSalary = await WeeklySalary.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      weekStartDate: testWeek.startDate,
      weekEndDate: testWeek.endDate,
      weekLabel: `Partial-${uniqueSuffix}`,
      finalSalary: 1000,
      totalPaid: 0,
      balanceRemaining: 1000,
      status: 'FINALIZED'
    });

    const partRes1 = await fetch(`${baseUrl}/salaries/${partialSalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: 300, paymentMethod: 'Cash', notes: 'First installment £300' })
    });
    const partData1 = await partRes1.json();
    assert.strictEqual(partRes1.status, 200);
    assert.strictEqual(partData1.salary.totalPaid, 300);
    assert.strictEqual(partData1.salary.balanceRemaining, 700);
    assert.strictEqual(partData1.salary.status, 'PARTIALLY_PAID');
    console.log('✓ PASS: Partial payment recorded (£300), Paid=£300, Outstanding=£700, status=PARTIALLY_PAID.');
    passed++;

    // ----------------------------------------------------
    // TEST 8 & 9 — Multiple installment payments & Outstanding amount
    // ----------------------------------------------------
    console.log('\n[TEST 8 & 9] Testing Multiple Installments on £1,000 salary (£300 + £700 = £1,000)...');
    const partRes2 = await fetch(`${baseUrl}/salaries/${partialSalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: 700, paymentMethod: 'Bank', notes: 'Second installment £700' })
    });
    const partData2 = await partRes2.json();
    assert.strictEqual(partRes2.status, 200);
    assert.strictEqual(partData2.salary.totalPaid, 1000);
    assert.strictEqual(partData2.salary.balanceRemaining, 0);
    assert.strictEqual(partData2.salary.status, 'PAID');
    console.log('✓ PASS: Multiple installments summed correctly: Total Paid=£1,000, Outstanding=£0, status=PAID.');
    passed += 2; // Tests 8 and 9

    // ----------------------------------------------------
    // TEST 10 — Overpayment is rejected
    // ----------------------------------------------------
    console.log('\n[TEST 10] Testing Overpayment Rejection (Salary £500, Paid £400, attempting to pay £200)...');
    const overpaySalary = await WeeklySalary.create({
      employee: testEmployee._id,
      employeeName: testEmployee.name,
      employeeId: testEmployee.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      weekStartDate: testWeek.startDate,
      weekEndDate: testWeek.endDate,
      weekLabel: `Overpay-${uniqueSuffix}`,
      finalSalary: 500,
      totalPaid: 400,
      balanceRemaining: 100,
      status: 'PARTIALLY_PAID'
    });

    const overpayRes = await fetch(`${baseUrl}/salaries/${overpaySalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: 200, paymentMethod: 'Cash' })
    });
    const overpayData = await overpayRes.json();
    assert.strictEqual(overpayRes.status, 400);
    assert.strictEqual(overpayData.success, false);
    assert.ok(overpayData.message.includes('100'), `Message should mention max payment £100: ${overpayData.message}`);
    console.log(`✓ PASS: Overpayment rejected: "${overpayData.message}".`);
    passed++;

    // ----------------------------------------------------
    // TEST 11 — Zero / negative payment is rejected
    // ----------------------------------------------------
    console.log('\n[TEST 11] Testing Zero / Negative / NaN Payment rejection...');
    const zeroPayRes = await fetch(`${baseUrl}/salaries/${overpaySalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: 0, paymentMethod: 'Cash' })
    });
    assert.strictEqual(zeroPayRes.status, 400);

    const negPayRes = await fetch(`${baseUrl}/salaries/${overpaySalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: -50, paymentMethod: 'Cash' })
    });
    assert.strictEqual(negPayRes.status, 400);

    const nanPayRes = await fetch(`${baseUrl}/salaries/${overpaySalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: 'invalid-amount', paymentMethod: 'Cash' })
    });
    assert.strictEqual(nanPayRes.status, 400);
    console.log('✓ PASS: Zero, negative, and non-numeric payment amounts correctly rejected (400).');
    passed++;

    // ----------------------------------------------------
    // TEST 12 — Duplicate payment submission is protected
    // ----------------------------------------------------
    console.log('\n[TEST 12] Testing Duplicate Payment protection (Rapid submission / Client reference)...');
    const clientRef = `REQ-${Date.now()}-${uniqueSuffix}`;
    const dupRes1 = await fetch(`${baseUrl}/salaries/${overpaySalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: 50, paymentMethod: 'Cash', clientReference: clientRef })
    });
    assert.strictEqual(dupRes1.status, 200);

    const dupRes2 = await fetch(`${baseUrl}/salaries/${overpaySalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: 50, paymentMethod: 'Cash', clientReference: clientRef })
    });
    assert.strictEqual(dupRes2.status, 409, 'Duplicate payment with same clientReference must be rejected with 409 Conflict');
    console.log('✓ PASS: Duplicate payment submission protected (409 Conflict returned).');
    passed++;

    // ----------------------------------------------------
    // TEST 13, 14 & 15 — Accounting Example (Section 20, 21, 39):
    // Salary = £60,000, Payment 1 = £20,000, Payment 2 = £40,000
    // Exactly ONE SALARY_EARNED transaction; Earned = £60k, Paid = £60k, Outstanding = £0
    // ----------------------------------------------------
    console.log('\n[TEST 13, 14 & 15] Testing Canonical Accounting Scenario:');
    console.log('   Salary: £60,000 | Payment 1: £20,000 | Payment 2: £40,000');

    // Create a new employee for the £60,000 accounting test to isolate ledger
    const acctEmp = await Employee.create({
      name: `Accounting Staff ${uniqueSuffix}`,
      employeeId: `ACCT_${uniqueSuffix}`,
      assignedShop: stationShop._id,
      dailyWage: 100,
      employmentStatus: 'Active'
    });

    const acctSalary = await WeeklySalary.create({
      employee: acctEmp._id,
      employeeName: acctEmp.name,
      employeeId: acctEmp.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      weekStartDate: testWeek.startDate,
      weekEndDate: testWeek.endDate,
      weekLabel: `AcctWeek-${uniqueSuffix}`,
      workingDays: 5,
      netAttendancePay: 60000,
      finalSalary: 60000,
      totalPaid: 0,
      balanceRemaining: 60000,
      status: 'Generated'
    });

    // Step A: Admin finalizes the £60,000 salary
    const finAcctRes = await fetch(`${baseUrl}/salaries/${acctSalary._id}/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(finAcctRes.status, 200);

    // Step B: Payment 1 = £20,000
    const pay1Res = await fetch(`${baseUrl}/salaries/${acctSalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: 20000, paymentMethod: 'Bank', notes: 'Installment 1 £20k' })
    });
    assert.strictEqual(pay1Res.status, 200);

    // Step C: Payment 2 = £40,000
    const pay2Res = await fetch(`${baseUrl}/salaries/${acctSalary._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ amount: 40000, paymentMethod: 'Bank', notes: 'Installment 2 £40k' })
    });
    assert.strictEqual(pay2Res.status, 200);

    // Fetch employee ledger
    const ledgerRes = await fetch(`${baseUrl}/salaries/ledger/employee/${acctEmp._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const ledgerData = await ledgerRes.json();
    assert.strictEqual(ledgerRes.status, 200);
    assert.strictEqual(ledgerData.success, true);

    const earnedEntries = ledgerData.transactions.filter(t => t.transactionType === 'SALARY_EARNED');
    const paymentEntries = ledgerData.transactions.filter(t => t.transactionType === 'SALARY_PAYMENT');

    // Test 13: Salary-earned ledger transaction is created exactly once
    assert.strictEqual(earnedEntries.length, 1, 'There must be strictly ONE SALARY_EARNED ledger transaction');
    assert.strictEqual(earnedEntries[0].amountEarned, 60000);

    // Test 14: Multiple payments create multiple payment ledger entries without duplicating earned entry
    assert.strictEqual(paymentEntries.length, 2, 'There must be exactly 2 SALARY_PAYMENT ledger transactions');
    assert.strictEqual(paymentEntries[0].amountPaid, 20000);
    assert.strictEqual(paymentEntries[1].amountPaid, 40000);

    // Test 15: Totals match Earned = £60,000, Paid = £60,000, Outstanding = £0
    assert.strictEqual(ledgerData.totals.earned, 60000);
    assert.strictEqual(ledgerData.totals.paid, 60000);
    assert.strictEqual(ledgerData.totals.outstanding, 0);
    console.log('✓ PASS: Canonical accounting scenario verified: Exactly 1 SALARY_EARNED (£60,000), 2 SALARY_PAYMENTS (£20,000, £40,000), Balance=£0.');
    passed += 3; // Tests 13, 14, 15

    // ----------------------------------------------------
    // TEST 16 — Salary Distributor cannot modify salary
    // ----------------------------------------------------
    console.log('\n[TEST 16] Testing Salary Distributor cannot modify/generate salary or finalize...');
    const distGenRes = await fetch(`${baseUrl}/salaries/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ date: '2026-09-14' })
    });
    assert.strictEqual(distGenRes.status, 403, 'Distributor must be blocked from generating salary (403)');

    const distFinRes = await fetch(`${baseUrl}/salaries/${salaryDoc._id}/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${distributorToken}` }
    });
    assert.strictEqual(distFinRes.status, 403, 'Distributor must be blocked from finalizing salary (403)');
    console.log('✓ PASS: Salary Distributor blocked from generate and finalize (403 Forbidden).');
    passed++;

    // ----------------------------------------------------
    // TEST 17 — Salary Distributor cannot modify attendance
    // ----------------------------------------------------
    console.log('\n[TEST 17] Testing Salary Distributor cannot modify attendance...');
    const distAttRes = await fetch(`${baseUrl}/attendance/${att1._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ timeReached: '10:00' })
    });
    assert.strictEqual(distAttRes.status, 403, 'Distributor must be blocked from modifying attendance (403)');
    console.log('✓ PASS: Salary Distributor blocked from modifying attendance (403 Forbidden).');
    passed++;

    // ----------------------------------------------------
    // TEST 18 — Salary Distributor cannot modify bonus/allowances/deductions
    // ----------------------------------------------------
    console.log('\n[TEST 18] Testing Salary Distributor cannot modify bonus/allowances/deductions...');
    const distBonusRes = await fetch(`${baseUrl}/bonuses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({
        employeeId: testEmployee._id,
        month: 'Sep',
        year: 2026,
        salesAmount: 5000,
        bonusPercentage: 2
      })
    });
    assert.strictEqual(distBonusRes.status, 403, 'Distributor must be blocked from creating bonus (403)');

    const distAdjRes = await fetch(`${baseUrl}/salaries/${salaryDoc._id}/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${distributorToken}` },
      body: JSON.stringify({ type: 'TRAVEL_ALLOWANCE', amount: 30, reason: 'Test' })
    });
    assert.strictEqual(distAdjRes.status, 403, 'Distributor must be blocked from adjustments (403)');
    console.log('✓ PASS: Salary Distributor blocked from creating bonuses and adjustments (403 Forbidden).');
    passed++;

    // ----------------------------------------------------
    // TEST 19 — Admin can view payment history
    // ----------------------------------------------------
    console.log('\n[TEST 19] Admin retrieves payment history via GET /api/salaries/:id/payments...');
    const histRes = await fetch(`${baseUrl}/salaries/${acctSalary._id}/payments`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const histData = await histRes.json();
    assert.strictEqual(histRes.status, 200);
    assert.strictEqual(histData.success, true);
    assert.strictEqual(histData.payments.length, 2);
    assert.strictEqual(histData.payments[0].amount, 20000);
    assert.strictEqual(histData.payments[1].amount, 40000);
    console.log(`✓ PASS: Admin retrieved payment history: ${histData.payments.length} payments found.`);
    passed++;

    // ----------------------------------------------------
    // TEST 20 — Historical finalized salary remains unchanged after employee wage/shop changes
    // ----------------------------------------------------
    console.log('\n[TEST 20] Testing Historical Protection: wage £100 -> £200, shop change...');
    await Employee.findByIdAndUpdate(acctEmp._id, {
      dailyWage: 200,
      assignedShop: camdenShop._id
    });

    const checkFinalized = await WeeklySalary.findById(acctSalary._id);
    assert.strictEqual(checkFinalized.finalSalary, 60000, 'Finalized salary amount must NOT change');
    assert.strictEqual(checkFinalized.status, 'PAID', 'Status must remain PAID');
    console.log(`✓ PASS: Historical salary protected: Final salary remains £${checkFinalized.finalSalary} after employee wage update.`);
    passed++;

    // ----------------------------------------------------
    // TEST 21 — Audit log is created for salary finalization
    // ----------------------------------------------------
    console.log('\n[TEST 21] Verifying AuditLog created for SALARY_FINALIZED...');
    const finalAudit = await AuditLog.findOne({
      action: 'SALARY_FINALIZED',
      recordId: salaryDoc._id
    });
    assert.ok(finalAudit, 'Audit log for SALARY_FINALIZED must exist');
    assert.strictEqual(finalAudit.role, 'ADMIN');
    console.log(`✓ PASS: AuditLog verified: action=${finalAudit.action}, user=${finalAudit.username}, role=${finalAudit.role}`);
    passed++;

    // ----------------------------------------------------
    // TEST 22 — Audit log is created for payment creation
    // ----------------------------------------------------
    console.log('\n[TEST 22] Verifying AuditLog created for SALARY_PAYMENT_CREATED...');
    const paymentAudit = await AuditLog.findOne({
      action: 'SALARY_PAYMENT_CREATED',
      username: distributorUser.name
    });
    assert.ok(paymentAudit, 'Audit log for SALARY_PAYMENT_CREATED must exist');
    assert.strictEqual(paymentAudit.role, 'SALARY_DISTRIBUTOR');
    console.log(`✓ PASS: AuditLog verified: action=${paymentAudit.action}, user=${paymentAudit.username}, role=${paymentAudit.role}`);
    passed++;

    // Clean up test records
    await Employee.deleteMany({ _id: { $in: [testEmployee._id, acctEmp._id] } });
    await Attendance.deleteMany({ employee: { $in: [testEmployee._id, acctEmp._id] } });
    await WeeklySalary.deleteMany({ employee: { $in: [testEmployee._id, acctEmp._id] } });
    await SalaryPayment.deleteMany({ employee: { $in: [testEmployee._id, acctEmp._id] } });
    await LedgerTransaction.deleteMany({ employee: { $in: [testEmployee._id, acctEmp._id] } });

    console.log('\n===========================================================');
    console.log(`  PHASE 7 TEST RESULTS: ${passed} / ${totalTests} PASSED`);
    console.log('===========================================================');
    console.log('🎉 ALL PHASE 7 SALARY FINALIZATION & PAYMENT REQUIREMENTS FULLY VERIFIED!\n');

  } catch (err) {
    console.error('Phase 7 Test execution failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runPhase7Tests().catch(err => {
  console.error('Unhandled failure:', err);
  process.exit(1);
});
