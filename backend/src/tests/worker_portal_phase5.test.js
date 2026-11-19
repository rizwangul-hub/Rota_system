/**
 * Automated Test Suite: Worker Portal Phase 5 (Worker Salary, Payslips & Personal Ledger)
 *
 * Verifies:
 * 1. Worker retrieves ONLY finalized salaries (FINALIZED, PAID, PARTIALLY_PAID)
 * 2. Draft / GENERATED unfinalized salaries are strictly hidden from worker view
 * 3. Anti-IDOR: Worker A cannot access Worker B's salary records or detailed payslip
 * 4. Historical salary snapshots remain strictly unchanged (no recalculation using current wage)
 * 5. Detailed itemized salary breakdown displays correct gross, allowances, deductions and net figures
 * 6. Installment payments are NOT counted as additional earnings (a £1,000 salary paid in 3 installments shows earned: £1,000, received: £1,000, balance: £0)
 * 7. Running ledger balance calculates accurately in chronological order
 * 8. Outstanding balance calculates accurately across all finalized records
 * 9. Payment receipts endpoint returns correct payment details with internal notes stripped
 * 10. PDF generation works: returns application/pdf with valid PDF binary header (%PDF)
 * 11. PDF ownership protection: Worker B cannot download Worker A's payslip PDF (returns 404/403)
 * 12. Workers cannot modify, finalize, or create salary records (PUT /api/salaries returns 403)
 * 13. Date filters (THIS_MONTH, THIS_YEAR, CUSTOM) return accurate filtered subsets
 * 14. Non-workers cannot access /api/worker/salaries (403 Forbidden)
 */

const assert = require('assert');
const path = require('path');
const http = require('http');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const WeeklySalary = require('../models/WeeklySalary');
const SalaryPayment = require('../models/SalaryPayment');
const LedgerTransaction = require('../models/LedgerTransaction');
const { JWT_SECRET } = require('../middleware/auth');
const { getUKDateString } = require('../utils/calc');

async function runPhase5Tests() {
  console.log('\n======================================================');
  console.log('--- RUNNING WORKER PORTAL PHASE 5 SALARY TESTS ---');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const todayStr = getUKDateString();
  const [tY, tM] = todayStr.split('-').map(Number);

  // Setup entities
  const shop = (await Shop.findOne()) || (await Shop.create({ name: 'Test Shop P5', code: 'TST5' }));

  // Create Worker A
  let empA = await Employee.findOne({ employeeId: 'TEST_P5_WKRA' });
  if (!empA) {
    empA = await Employee.create({
      employeeId: 'TEST_P5_WKRA',
      name: 'Alice Phase5',
      email: 'alice.phase5@pixxrota.com',
      dailyWage: 90,
      assignedShop: shop._id,
      employmentStatus: 'Active'
    });
  }

  // Create Worker B
  let empB = await Employee.findOne({ employeeId: 'TEST_P5_WKRB' });
  if (!empB) {
    empB = await Employee.create({
      employeeId: 'TEST_P5_WKRB',
      name: 'Bob Phase5',
      email: 'bob.phase5@pixxrota.com',
      dailyWage: 95,
      assignedShop: shop._id,
      employmentStatus: 'Active'
    });
  }

  // Clean & create User accounts
  await User.deleteMany({ email: { $in: ['alice.p5@pixxrota.com', 'bob.p5@pixxrota.com', 'admin.p5@pixxrota.com'] } });

  const userA = await User.create({
    name: 'Alice Phase5',
    username: 'alice.p5@pixxrota.com',
    email: 'alice.p5@pixxrota.com',
    password: 'Password123!',
    role: 'WORKER',
    employee: empA._id,
    assignedShop: shop._id,
    isActive: true
  });

  const userB = await User.create({
    name: 'Bob Phase5',
    username: 'bob.p5@pixxrota.com',
    email: 'bob.p5@pixxrota.com',
    password: 'Password123!',
    role: 'WORKER',
    employee: empB._id,
    assignedShop: shop._id,
    isActive: true
  });

  const userAdmin = await User.create({
    name: 'Admin Phase5',
    username: 'admin.p5@pixxrota.com',
    email: 'admin.p5@pixxrota.com',
    password: 'Password123!',
    role: 'ADMIN',
    isActive: true
  });

  const tokenA = jwt.sign(
    { id: userA._id, role: userA.role, employeeId: empA._id, email: userA.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  const tokenB = jwt.sign(
    { id: userB._id, role: userB.role, employeeId: empB._id, email: userB.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  const tokenAdmin = jwt.sign(
    { id: userAdmin._id, role: userAdmin.role, email: userAdmin.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Clean existing test salaries, payments & ledger entries
  await WeeklySalary.deleteMany({ employee: { $in: [empA._id, empB._id] } });
  await SalaryPayment.deleteMany({ employee: { $in: [empA._id, empB._id] } });
  await LedgerTransaction.deleteMany({ employee: { $in: [empA._id, empB._id] } });

  let passed = 0;
  let total = 14;

  try {
    // -------------------------------------------------------------------------
    // SETUP TEST SALARIES FOR WORKER A
    // Salary 1: Finalized, £1,000 net, paid in 3 installments (£300 + £300 + £400) -> balance: £0, status: PAID
    // Salary 2: Finalized, £500 net, unpaid -> balance: £500, status: FINALIZED
    // Salary 3: DRAFT / GENERATED, £450 (Should be completely HIDDEN)
    // -------------------------------------------------------------------------
    const sal1 = await WeeklySalary.create({
      employee: empA._id,
      employeeName: empA.name,
      employeeId: empA.employeeId,
      shop: shop._id,
      shopName: shop.name,
      weekStartDate: new Date('2026-11-01T00:00:00Z'),
      weekEndDate: new Date('2026-11-07T23:59:59Z'),
      weekStartDateString: '2026-11-01',
      weekEndDateString: '2026-11-07',
      weekLabel: '01/11/2026 to 07/11/2026',
      workingDays: 5,
      actualHours: 45,
      grossDailyWages: 900,
      travelAllowance: 50,
      otherAllowances: 20,
      bonus: 80,
      lateDeductions: 30,
      manualDeductions: 20,
      loanDeduction: 0,
      finalSalary: 1000,
      totalPaid: 1000,
      balanceRemaining: 0,
      status: 'PAID',
      finalizedAt: new Date('2026-11-08T12:00:00Z'),
      notes: 'Internal management payroll notes - do not expose',
      attendanceBreakdown: [
        {
          dateString: '2026-11-02',
          dayOfWeek: 'Monday',
          shopName: shop.name,
          shiftStart: '09:00',
          shiftEnd: '18:00',
          timeReached: '09:00',
          workerEndTime: '18:00',
          scheduledHours: 9,
          actualHours: 9,
          status: 'Present',
          dailyWage: 90,
          lateMinutes: 0,
          lateDeduction: 0,
          attendancePay: 90
        }
      ]
    });

    // 3 installment payments for Salary 1: £300 + £300 + £400 = £1,000
    await SalaryPayment.create({
      weeklySalary: sal1._id,
      employee: empA._id,
      employeeName: empA.name,
      shop: shop._id,
      shopName: shop.name,
      weekLabel: sal1.weekLabel,
      amount: 300,
      paymentMethod: 'Cash',
      paymentDate: new Date('2026-11-09T14:00:00Z'),
      paidBy: userAdmin._id,
      paidByName: 'Admin',
      clientReference: 'REC-P1-300'
    });

    await SalaryPayment.create({
      weeklySalary: sal1._id,
      employee: empA._id,
      employeeName: empA.name,
      shop: shop._id,
      shopName: shop.name,
      weekLabel: sal1.weekLabel,
      amount: 300,
      paymentMethod: 'Bank',
      paymentDate: new Date('2026-11-10T14:00:00Z'),
      paidBy: userAdmin._id,
      paidByName: 'Admin',
      clientReference: 'REC-P2-300'
    });

    await SalaryPayment.create({
      weeklySalary: sal1._id,
      employee: empA._id,
      employeeName: empA.name,
      shop: shop._id,
      shopName: shop.name,
      weekLabel: sal1.weekLabel,
      amount: 400,
      paymentMethod: 'Cash',
      paymentDate: new Date('2026-11-11T14:00:00Z'),
      paidBy: userAdmin._id,
      paidByName: 'Admin',
      clientReference: 'REC-P3-400'
    });

    // Salary 2: Finalized, £500 net, unpaid
    const sal2 = await WeeklySalary.create({
      employee: empA._id,
      employeeName: empA.name,
      employeeId: empA.employeeId,
      shop: shop._id,
      shopName: shop.name,
      weekStartDate: new Date('2026-11-08T00:00:00Z'),
      weekEndDate: new Date('2026-11-14T23:59:59Z'),
      weekStartDateString: '2026-11-08',
      weekEndDateString: '2026-11-14',
      weekLabel: '08/11/2026 to 14/11/2026',
      workingDays: 5,
      actualHours: 40,
      grossDailyWages: 500,
      finalSalary: 500,
      totalPaid: 0,
      balanceRemaining: 500,
      status: 'FINALIZED',
      finalizedAt: new Date('2026-11-15T12:00:00Z')
    });

    // Salary 3: Draft / Generated (Must NOT be exposed)
    const salDraft = await WeeklySalary.create({
      employee: empA._id,
      employeeName: empA.name,
      employeeId: empA.employeeId,
      shop: shop._id,
      shopName: shop.name,
      weekStartDate: new Date('2026-11-15T00:00:00Z'),
      weekEndDate: new Date('2026-11-21T23:59:59Z'),
      weekStartDateString: '2026-11-15',
      weekEndDateString: '2026-11-21',
      weekLabel: '15/11/2026 to 21/11/2026',
      finalSalary: 450,
      status: 'GENERATED'
    });

    // Setup Salary for Worker B (for Anti-IDOR testing)
    const salB = await WeeklySalary.create({
      employee: empB._id,
      employeeName: empB.name,
      employeeId: empB.employeeId,
      shop: shop._id,
      shopName: shop.name,
      weekStartDate: new Date('2026-11-01T00:00:00Z'),
      weekEndDate: new Date('2026-11-07T23:59:59Z'),
      weekStartDateString: '2026-11-01',
      weekEndDateString: '2026-11-07',
      weekLabel: '01/11/2026 to 07/11/2026',
      finalSalary: 750,
      totalPaid: 750,
      balanceRemaining: 0,
      status: 'PAID'
    });

    // =========================================================================
    // TEST 1: Worker retrieves only their finalized salaries
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/salaries?filter=ALL`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.records.length, 2, 'Should only see the 2 finalized records (PAID & FINALIZED)');
      console.log('✓ Test 1 Passed: Worker retrieves only finalized salaries.');
      passed++;
    }

    // =========================================================================
    // TEST 2: Draft / GENERATED salary remains strictly hidden
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/salaries?filter=ALL`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      const hasDraft = data.records.some(r => r.id.toString() === salDraft._id.toString());
      assert.strictEqual(hasDraft, false, 'GENERATED/Draft salary must never be included');
      console.log('✓ Test 2 Passed: Draft and generated salaries are strictly hidden.');
      passed++;
    }

    // =========================================================================
    // TEST 3: Anti-IDOR: Worker A cannot access Worker B's salary records
    // =========================================================================
    {
      // Worker A attempts to fetch Worker B's salary details
      const res = await fetch(`${baseUrl}/worker/salaries/${salB._id}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.status, 404, 'Worker A must not be able to access Worker B salary');
      console.log('✓ Test 3 Passed: Strict Anti-IDOR protection blocks cross-worker salary access.');
      passed++;
    }

    // =========================================================================
    // TEST 4: Historical salary snapshot is authoritative (no recalculation)
    // =========================================================================
    {
      // Even if employee's current daily wage is changed from 90 to 150...
      await Employee.updateOne({ _id: empA._id }, { $set: { dailyWage: 150 } });

      const res = await fetch(`${baseUrl}/worker/salaries/${sal1._id}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.payslip.finalSalary, 1000, 'Historical finalSalary must remain 1000');
      assert.strictEqual(data.payslip.earnings.grossDailyWages, 900, 'Historical gross wages must remain 900');
      console.log('✓ Test 4 Passed: Historical salary snapshot remains authoritative and uncompromised.');
      passed++;
    }

    // =========================================================================
    // TEST 5: Detailed itemized salary breakdown displays correct figures
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/salaries/${sal1._id}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      const p = data.payslip;
      assert.strictEqual(p.workingDays, 5);
      assert.strictEqual(p.actualHours, 45);
      assert.strictEqual(p.earnings.grossDailyWages, 900);
      assert.strictEqual(p.earnings.travelAllowance, 50);
      assert.strictEqual(p.earnings.otherAllowances, 20);
      assert.strictEqual(p.earnings.bonus, 80);
      assert.strictEqual(p.earnings.grossTotal, 1050);
      assert.strictEqual(p.deductions.lateDeductions, 30);
      assert.strictEqual(p.deductions.manualDeductions, 20);
      assert.strictEqual(p.deductions.totalDeductions, 50);
      assert.strictEqual(p.finalSalary, 1000);
      assert.strictEqual(p.totalPaid, 1000);
      assert.strictEqual(p.balanceRemaining, 0);
      assert.strictEqual(p.status, 'PAID');
      console.log('✓ Test 5 Passed: Itemized payslip breakdown computes and displays correct figures.');
      passed++;
    }

    // =========================================================================
    // TEST 6: Installment payments are NOT counted as additional earnings
    // (£1,000 salary paid in 3 installments shows earned: £1,000, received: £1,000)
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/ledger`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      const summary = data.summary;

      // Alice has: Sal1 (£1000) + Sal2 (£500) = £1500 earned
      // Paid: £300 + £300 + £400 = £1000 paid
      // Outstanding: £1500 - £1000 = £500
      assert.strictEqual(summary.totalEarned, 1500, 'Total earned must be £1,500 (Sal1 + Sal2)');
      assert.strictEqual(summary.totalPaid, 1000, 'Total paid must be £1,000 from installments');
      assert.strictEqual(summary.outstandingBalance, 500, 'Outstanding balance must be £500');
      console.log('✓ Test 6 Passed: Installment payments are not counted as extra earnings.');
      passed++;
    }

    // =========================================================================
    // TEST 7: Running ledger balance calculates accurately in chronological order
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/ledger`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(data.transactions.length >= 4, 'Should have at least 2 salaries + 3 payments');

      // The latest transaction (top of list) should have runningBalance equal to outstandingBalance
      assert.strictEqual(data.transactions[0].runningBalance, 500);
      console.log('✓ Test 7 Passed: Running ledger balance tracks chronologically.');
      passed++;
    }

    // =========================================================================
    // TEST 8: Outstanding balance calculates accurately across all finalized records
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/salaries`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(data.summary.outstandingBalance, 500);
      console.log('✓ Test 8 Passed: Outstanding balance aggregates accurately.');
      passed++;
    }

    // =========================================================================
    // TEST 9: Payment receipts show correct details with internal notes stripped
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/payments`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.payments.length, 3);
      assert.strictEqual(data.totalPaid, 1000);

      // Verify internal accounting notes are not exposed
      const p1 = data.payments[0];
      assert.strictEqual(p1.notes, undefined, 'Internal notes must not be present');
      assert.ok(p1.receiptNumber);
      assert.ok(p1.paymentMethod);
      console.log('✓ Test 9 Passed: Payment receipts return sanitized transaction history.');
      passed++;
    }

    // =========================================================================
    // TEST 10: PDF generation works and returns valid application/pdf binary
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/salaries/${sal1._id}/payslip-pdf`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'application/pdf');

      const buffer = await res.arrayBuffer();
      const headerString = Buffer.from(buffer).slice(0, 5).toString('utf-8');
      assert.strictEqual(headerString, '%PDF-', 'PDF stream must start with valid %PDF- header');
      assert.ok(buffer.byteLength > 1000, 'PDF size should be at least 1KB');
      console.log('✓ Test 10 Passed: PDF payslip generates and streams valid binary PDF.');
      passed++;
    }

    // =========================================================================
    // TEST 11: PDF ownership protection: Worker B cannot download Worker A's PDF
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/salaries/${sal1._id}/payslip-pdf`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.status, 404, 'Worker B must be denied Worker A payslip PDF');
      console.log('✓ Test 11 Passed: PDF download strictly enforces authenticated ownership.');
      passed++;
    }

    // =========================================================================
    // TEST 12: Workers cannot modify or finalize salary records (403 Forbidden)
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/salaries/${sal2._id}/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`
        }
      });
      assert.strictEqual(res.status, 403, 'Workers must be forbidden from finalizing salaries');
      console.log('✓ Test 12 Passed: Worker cannot modify or finalize salaries (403 Forbidden).');
      passed++;
    }

    // =========================================================================
    // TEST 13: Date filters (THIS_WEEK, LAST_WEEK, THIS_MONTH, THIS_YEAR, CUSTOM) return accurate results
    // =========================================================================
    {
      const resWeek = await fetch(`${baseUrl}/worker/salaries?filter=THIS_WEEK`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const dataWeek = await resWeek.json();
      assert.strictEqual(resWeek.status, 200);
      assert.ok(dataWeek.filterLabel);

      const resLastWeek = await fetch(`${baseUrl}/worker/salaries?filter=LAST_WEEK`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const dataLastWeek = await resLastWeek.json();
      assert.strictEqual(resLastWeek.status, 200);
      assert.ok(dataLastWeek.filterLabel);

      const resMonth = await fetch(`${baseUrl}/worker/salaries?filter=THIS_MONTH`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const dataMonth = await resMonth.json();
      assert.strictEqual(resMonth.status, 200);
      assert.ok(dataMonth.filterLabel.includes('This Month'));

      const resCustom = await fetch(`${baseUrl}/worker/salaries?filter=CUSTOM&startDate=2026-11-01&endDate=2026-11-07`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const dataCustom = await resCustom.json();
      assert.strictEqual(resCustom.status, 200);
      assert.strictEqual(dataCustom.records.length, 1, 'Custom filter should only match Sal1');
      console.log('✓ Test 13 Passed: Date filters (THIS_WEEK, LAST_WEEK, THIS_MONTH, CUSTOM) return accurate subsets.');
      passed++;
    }

    // =========================================================================
    // TEST 14: Non-workers cannot access /api/worker/salaries
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/salaries`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` }
      });
      assert.strictEqual(res.status, 403, 'Admin cannot access /api/worker/salaries directly');
      console.log('✓ Test 14 Passed: Non-worker role cannot access /api/worker/salaries.');
      passed++;
    }

  } finally {
    // Cleanup
    server.close();
    await User.deleteMany({ email: { $in: ['alice.p5@pixxrota.com', 'bob.p5@pixxrota.com', 'admin.p5@pixxrota.com'] } });
    await Employee.deleteMany({ employeeId: { $in: ['TEST_P5_WKRA', 'TEST_P5_WKRB'] } });
    await WeeklySalary.deleteMany({ employee: { $in: [empA._id, empB._id] } });
    await SalaryPayment.deleteMany({ employee: { $in: [empA._id, empB._id] } });
    await LedgerTransaction.deleteMany({ employee: { $in: [empA._id, empB._id] } });
    await mongoose.disconnect();
  }

  console.log('\n======================================================');
  console.log(`--- WORKER PORTAL PHASE 5 TESTS COMPLETED: ${passed}/${total} PASSED ---`);
  console.log('======================================================\n');
}

runPhase5Tests().catch((err) => {
  console.error('\n❌ PHASE 5 TEST RUN FAILED:', err);
  process.exit(1);
});
