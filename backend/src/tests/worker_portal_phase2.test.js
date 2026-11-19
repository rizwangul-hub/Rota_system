/**
 * Automated Test Suite: Worker Portal Phase 2 (Worker Dashboard & Shell)
 * 
 * Verifies:
 * - Worker dashboard aggregation endpoint: /api/worker/dashboard
 * - Strict Data Isolation: Worker A cannot see Worker B's shifts, attendance, or salary
 * - Gating Rule 1: Draft rota is NEVER exposed as nextShift (PUBLISHED only)
 * - Gating Rule 2: Unverified attendance is NEVER counted in verified hours (Checked/Finalized only)
 * - Gating Rule 3: Draft/generated salary is NEVER exposed as finalized salary (FINALIZED only)
 * - Confidential profile safety: dailyWage, bankDetails, NI numbers are excluded
 * - Role authorization: Only WORKER role can access /api/worker/dashboard
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
const Attendance = require('../models/Attendance');
const WeeklySalary = require('../models/WeeklySalary');
const WeeklyRota = require('../models/WeeklyRota');
const { JWT_SECRET } = require('../middleware/auth');
const { getUKDateString, getWeekRange } = require('../utils/calc');

async function runPhase2Tests() {
  console.log('\n======================================================');
  console.log('--- RUNNING WORKER PORTAL PHASE 2 DASHBOARD TESTS ---');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const todayStr = getUKDateString();
  const { startDateString, endDateString, weekLabel } = getWeekRange(todayStr);

  // Setup entities
  const shop = (await Shop.findOne()) || (await Shop.create({ name: 'Test Shop', code: 'TST' }));

  // Create Worker A
  let empA = await Employee.findOne({ employeeId: 'TEST_P2_WKRA' });
  if (!empA) {
    empA = await Employee.create({
      employeeId: 'TEST_P2_WKRA',
      name: 'Alice Worker',
      email: 'alice.worker@pixxrota.com',
      dailyWage: 65,
      assignedShop: shop._id,
      employmentStatus: 'Active',
      bankAccountNumber: '12345678',
      nationalInsuranceNumber: 'QQ123456A'
    });
  }

  // Create Worker B
  let empB = await Employee.findOne({ employeeId: 'TEST_P2_WKRB' });
  if (!empB) {
    empB = await Employee.create({
      employeeId: 'TEST_P2_WKRB',
      name: 'Bob Worker',
      email: 'bob.worker@pixxrota.com',
      dailyWage: 70,
      assignedShop: shop._id,
      employmentStatus: 'Active',
      bankAccountNumber: '87654321',
      nationalInsuranceNumber: 'QQ123456B'
    });
  }

  // Clean and create user accounts
  await User.deleteMany({ email: { $in: ['alice.worker@pixxrota.com', 'bob.worker@pixxrota.com'] } });

  const userA = await User.create({
    name: empA.name,
    username: empA.email,
    email: empA.email,
    password: 'Password123!',
    role: 'WORKER',
    employee: empA._id,
    assignedShop: shop._id,
    isActive: true
  });

  const userB = await User.create({
    name: empB.name,
    username: empB.email,
    email: empB.email,
    password: 'Password123!',
    role: 'WORKER',
    employee: empB._id,
    assignedShop: shop._id,
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

  const adminUser = await User.findOne({ role: 'ADMIN', isActive: true });
  const adminToken = jwt.sign(
    { id: adminUser._id, role: 'ADMIN', username: adminUser.username },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Clean test data without destroying real database records
  await Attendance.deleteMany({ employee: { $in: [empA._id, empB._id] } });
  await WeeklySalary.deleteMany({ employee: { $in: [empA._id, empB._id] } });
  
  // Safely back up existing real rota if present so tests never destroy production data
  const existingActiveRota = await WeeklyRota.findOne({ weekStart: startDateString }).lean();
  if (existingActiveRota) {
    await WeeklyRota.deleteOne({ _id: existingActiveRota._id });
  }

  try {
    // TEST 1: Dashboard loads for Worker A
    console.log('Test 1: Worker A fetches dashboard payload...');
    const dashRes = await fetch(`${baseUrl}/worker/dashboard`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const dashData = await dashRes.json();
    assert.strictEqual(dashRes.status, 200, 'Worker dashboard returns 200');
    assert.strictEqual(dashData.success, true);
    assert.strictEqual(dashData.worker.employeeId, 'TEST_P2_WKRA');
    assert.strictEqual(dashData.worker.name, 'Alice Worker');
    // Ensure sensitive confidential data is shielded
    assert.strictEqual(dashData.worker.dailyWage, undefined, 'Daily wage must be stripped');
    assert.strictEqual(dashData.worker.bankAccountNumber, undefined, 'Bank account must be stripped');
    assert.strictEqual(dashData.worker.nationalInsuranceNumber, undefined, 'NI must be stripped');
    console.log('   ✓ Passed: Dashboard returned with safe worker identity and stripped confidential data.');

    // TEST 2: Draft Rota is NEVER exposed as nextShift
    console.log('Test 2: Gating Rule — Draft Rota is NEVER exposed in nextShift...');
    // Create a DRAFT rota with an assignment for Worker A
    const draftRota = await WeeklyRota.create({
      weekStart: startDateString,
      weekEnd: endDateString,
      status: 'DRAFT',
      assignments: [
        {
          employeeId: empA._id,
          shopId: shop._id,
          dateKey: todayStr,
          startTime: '10:00',
          endTime: '18:00',
          scheduledHours: 8,
          status: 'AVAILABLE'
        }
      ]
    });

    const draftCheckRes = await fetch(`${baseUrl}/worker/dashboard`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const draftCheckData = await draftCheckRes.json();
    assert.strictEqual(
      draftCheckData.nextShift,
      null,
      'Draft rota must NEVER be visible to worker as nextShift'
    );
    console.log('   ✓ Passed: Draft rota properly hidden from worker dashboard.');

    // TEST 3: Published Rota IS exposed as nextShift
    console.log('Test 3: Gating Rule — Published Rota IS visible in nextShift...');
    draftRota.status = 'PUBLISHED';
    await draftRota.save();

    const publishedCheckRes = await fetch(`${baseUrl}/worker/dashboard`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const publishedCheckData = await publishedCheckRes.json();
    assert.notStrictEqual(publishedCheckData.nextShift, null);
    assert.strictEqual(publishedCheckData.nextShift.startTime, '10:00');
    assert.strictEqual(publishedCheckData.nextShift.endTime, '18:00');
    assert.strictEqual(publishedCheckData.nextShift.scheduledHours, 8);
    console.log('   ✓ Passed: Published rota correctly surfaced as nextShift.');

    // TEST 4: Unverified attendance is NEVER counted in verified hours
    console.log('Test 4: Gating Rule — Unverified attendance is NOT counted in verified hours...');
    // Create unverified attendance for Worker A
    await Attendance.create({
      date: new Date(`${todayStr}T12:00:00Z`),
      dateString: todayStr,
      employee: empA._id,
      employeeName: empA.name,
      employeeId: empA.employeeId,
      shop: shop._id,
      shopName: shop.name,
      shiftStart: '09:00',
      shiftEnd: '17:00',
      timeReached: '09:00',
      workerEndTime: '16:30',
      scheduledHours: 8,
      actualHours: 7.5,
      dailyWage: 65,
      hourlyWage: 8.125,
      attendancePay: 60.94,
      status: 'Present',
      approvalStatus: 'Pending Review' // Not approved
    });

    const unverifiedCheckRes = await fetch(`${baseUrl}/worker/dashboard`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const unverifiedCheckData = await unverifiedCheckRes.json();
    assert.strictEqual(
      unverifiedCheckData.thisWeekAttendance.verifiedHours,
      0,
      'Pending Review attendance must not count towards verified hours'
    );
    assert.strictEqual(
      unverifiedCheckData.thisWeekAttendance.verifiedDays,
      0,
      'Pending Review attendance must not count towards verified days'
    );
    console.log('   ✓ Passed: Unverified attendance strictly excluded from verified weekly metrics.');

    // TEST 5: Verified (Checked) attendance IS counted
    console.log('Test 5: Gating Rule — Checked/Finalized attendance IS counted in verified hours...');
    await Attendance.findOneAndUpdate(
      { employee: empA._id, dateString: todayStr },
      { approvalStatus: 'Checked' }
    );

    const verifiedCheckRes = await fetch(`${baseUrl}/worker/dashboard`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const verifiedCheckData = await verifiedCheckRes.json();
    assert.strictEqual(verifiedCheckData.thisWeekAttendance.verifiedHours, 7.5);
    assert.strictEqual(verifiedCheckData.thisWeekAttendance.verifiedDays, 1);
    console.log('   ✓ Passed: Checked attendance correctly aggregated into verified hours and days.');

    // TEST 6: Draft/Generated salary is NEVER exposed
    console.log('Test 6: Gating Rule — Generated/Draft salary is NEVER shown as latest finalized...');
    const draftSalary = await WeeklySalary.create({
      employee: empA._id,
      employeeName: empA.name,
      employeeId: empA.employeeId,
      shop: shop._id,
      shopName: shop.name,
      weekStartDate: new Date(`${startDateString}T00:00:00Z`),
      weekEndDate: new Date(`${endDateString}T23:59:59Z`),
      weekLabel,
      weekStartDateString: startDateString,
      weekEndDateString: endDateString,
      finalSalary: 320.0,
      status: 'GENERATED' // Draft / Not finalized
    });

    const draftSalaryRes = await fetch(`${baseUrl}/worker/dashboard`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const draftSalaryData = await draftSalaryRes.json();
    assert.strictEqual(
      draftSalaryData.latestFinalizedSalary,
      null,
      'Generated salary must not appear as finalized salary'
    );
    console.log('   ✓ Passed: Generated unfinalized salary strictly hidden from worker.');

    // TEST 7: Finalized salary IS shown
    console.log('Test 7: Gating Rule — Finalized salary IS displayed accurately...');
    draftSalary.status = 'FINALIZED';
    draftSalary.totalPaid = 100.0;
    draftSalary.balanceRemaining = 220.0;
    await draftSalary.save();

    const finalizedSalaryRes = await fetch(`${baseUrl}/worker/dashboard`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const finalizedSalaryData = await finalizedSalaryRes.json();
    assert.notStrictEqual(finalizedSalaryData.latestFinalizedSalary, null);
    assert.strictEqual(finalizedSalaryData.latestFinalizedSalary.amount, 320.0);
    assert.strictEqual(finalizedSalaryData.latestFinalizedSalary.balanceRemaining, 220.0);
    assert.strictEqual(finalizedSalaryData.outstandingBalance, 220.0);
    console.log('   ✓ Passed: Finalized salary and outstanding balance accurately surfaced.');

    // TEST 8: Anti-IDOR Data Isolation between Worker A and Worker B
    console.log('Test 8: Anti-IDOR — Worker B cannot see Worker A data...');
    const workerBRes = await fetch(`${baseUrl}/worker/dashboard`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const workerBData = await workerBRes.json();
    assert.strictEqual(workerBData.worker.employeeId, 'TEST_P2_WKRB');
    // Worker B has no assignments or attendance
    assert.strictEqual(workerBData.nextShift, null, "Worker B must not see Worker A's shift");
    assert.strictEqual(
      workerBData.thisWeekAttendance.verifiedHours,
      0,
      "Worker B must not see Worker A's verified hours"
    );
    assert.strictEqual(
      workerBData.latestFinalizedSalary,
      null,
      "Worker B must not see Worker A's salary"
    );
    assert.strictEqual(workerBData.outstandingBalance, 0);
    console.log('   ✓ Passed: Worker B data is completely isolated from Worker A.');

    // TEST 9: Authorization Boundary — Admin blocked from worker dashboard
    console.log('Test 9: Authorization Boundary — Admin blocked from worker dashboard (403)...');
    const adminBlockedRes = await fetch(`${baseUrl}/worker/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(adminBlockedRes.status, 403, 'Admin token cannot access worker dashboard');
    console.log('   ✓ Passed: Worker dashboard is strictly protected for WORKER role only.');

    // TEST 10: Unauthenticated request rejected with 401
    console.log('Test 10: Unauthenticated request rejected (401)...');
    const noAuthRes = await fetch(`${baseUrl}/worker/dashboard`);
    assert.strictEqual(noAuthRes.status, 401, 'No token returns 401');
    console.log('   ✓ Passed: Unauthenticated request rejected.');

    console.log('\n======================================================');
    console.log('ALL 10 WORKER PORTAL PHASE 2 TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } finally {
    // Cleanup test data and restore backed-up real rota if existed
    await Attendance.deleteMany({ employee: { $in: [empA._id, empB._id] } });
    await WeeklySalary.deleteMany({ employee: { $in: [empA._id, empB._id] } });
    await WeeklyRota.deleteMany({ weekStart: startDateString });
    if (existingActiveRota) {
      delete existingActiveRota._id;
      delete existingActiveRota.__v;
      await WeeklyRota.create(existingActiveRota);
    }
    await User.deleteMany({ email: { $in: ['alice.worker@pixxrota.com', 'bob.worker@pixxrota.com'] } });
    await Employee.deleteMany({ employeeId: { $in: ['TEST_P2_WKRA', 'TEST_P2_WKRB'] } });
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
}

runPhase2Tests().catch((err) => {
  console.error('Phase 2 Test Failed:', err);
  process.exit(1);
});
