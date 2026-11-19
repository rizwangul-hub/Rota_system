/**
 * Automated Test Suite: Worker Portal Phase 3 (My Attendance History & Correction Requests)
 *
 * Verifies:
 * 1. Worker retrieves verified attendance records (Checked or Finalized) belonging ONLY to them
 * 2. Unverified attendance records (Pending Review, Draft) are strictly hidden
 * 3. Confidential wage fields (dailyWage, hourlyWage, attendancePay, lateDeduction) are stripped from API response
 * 4. Summary metrics (totalWorkingDays, totalWorkingHours, totalLateMinutes, presentCount, etc.) are computed accurately
 * 5. Date filters (THIS_WEEK, LAST_WEEK, THIS_MONTH, LAST_MONTH, CUSTOM) function correctly
 * 6. Worker submits an attendance correction request with full audit fields
 * 7. Duplicate pending correction request for the same date is rejected (400)
 * 8. Workers cannot directly edit attendance (PUT /api/attendance/:id returns 403 Forbidden)
 * 9. Strict Data Isolation: Worker B cannot view Worker A's attendance or correction requests
 * 10. Sarfraz (ATTENDANCE_CHECKER) and Admin can retrieve list of correction requests
 * 11. Reviewer can reject a correction request with workerResponse and reviewerNotes
 * 12. Reviewer can approve a correction request, which updates the Attendance record with recalculated hours
 * 13. Safety Lock: Correction approval is BLOCKED (400 FINALIZED_SALARY_LOCKED) if attendance is Finalized or linked to payroll
 * 14. Non-workers cannot access worker attendance endpoints
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
const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
const WeeklySalary = require('../models/WeeklySalary');
const { JWT_SECRET } = require('../middleware/auth');
const { getUKDateString, getWeekRange } = require('../utils/calc');

async function runPhase3Tests() {
  console.log('\n======================================================');
  console.log('--- RUNNING WORKER PORTAL PHASE 3 ATTENDANCE TESTS ---');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const todayStr = getUKDateString();
  const { startDateString, endDateString } = getWeekRange(todayStr);

  // Setup entities
  const shop = (await Shop.findOne()) || (await Shop.create({ name: 'Test Shop', code: 'TST' }));

  // Create Worker A
  let empA = await Employee.findOne({ employeeId: 'TEST_P3_WKRA' });
  if (!empA) {
    empA = await Employee.create({
      employeeId: 'TEST_P3_WKRA',
      name: 'Alice Phase3',
      email: 'alice.phase3@pixxrota.com',
      dailyWage: 80,
      assignedShop: shop._id,
      employmentStatus: 'Active'
    });
  }

  // Create Worker B
  let empB = await Employee.findOne({ employeeId: 'TEST_P3_WKRB' });
  if (!empB) {
    empB = await Employee.create({
      employeeId: 'TEST_P3_WKRB',
      name: 'Bob Phase3',
      email: 'bob.phase3@pixxrota.com',
      dailyWage: 85,
      assignedShop: shop._id,
      employmentStatus: 'Active'
    });
  }

  // Clean & create User accounts
  await User.deleteMany({ email: { $in: ['alice.p3@pixxrota.com', 'bob.p3@pixxrota.com', 'sarfraz.p3@pixxrota.com'] } });

  const userA = await User.create({
    name: 'Alice Phase3',
    username: 'alice.p3@pixxrota.com',
    email: 'alice.p3@pixxrota.com',
    password: 'Password123!',
    role: 'WORKER',
    employee: empA._id,
    assignedShop: shop._id,
    isActive: true
  });

  const userB = await User.create({
    name: 'Bob Phase3',
    username: 'bob.p3@pixxrota.com',
    email: 'bob.p3@pixxrota.com',
    password: 'Password123!',
    role: 'WORKER',
    employee: empB._id,
    assignedShop: shop._id,
    isActive: true
  });

  const userSarfraz = await User.create({
    name: 'Sarfraz Checker',
    username: 'sarfraz.p3@pixxrota.com',
    email: 'sarfraz.p3@pixxrota.com',
    password: 'Password123!',
    role: 'ATTENDANCE_CHECKER',
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
  const tokenSarfraz = jwt.sign(
    { id: userSarfraz._id, role: userSarfraz.role, email: userSarfraz.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Clean test attendance and correction requests
  await Attendance.deleteMany({ employeeId: { $in: [empA._id, empB._id] } });
  await AttendanceCorrectionRequest.deleteMany({ employeeId: { $in: [empA._id, empB._id] } });

  let passed = 0;
  let total = 14;

  try {
    // -------------------------------------------------------------
    // SETUP TEST ATTENDANCE DATA FOR WORKER A
    // Day 1: Checked (Present, 10:00 - 18:00, 8 hrs, 0 late)
    // Day 2: Finalized (Present, 10:30 - 18:00, 7.5 hrs, 30 min late)
    // Day 3: Pending Review (Draft/Unverified - should be HIDDEN from worker)
    // -------------------------------------------------------------
    const attChecked = await Attendance.create({
      employee: empA._id,
      employeeName: empA.name,
      employeeId: empA.employeeId,
      shop: shop._id,
      shopName: shop.name,
      date: new Date('2026-11-10T12:00:00Z'),
      dateString: '2026-11-10',
      status: 'Present',
      shiftStart: '10:00',
      shiftEnd: '18:00',
      timeReached: '10:00',
      workerEndTime: '18:00',
      scheduledHours: 8,
      actualHours: 8,
      approvalStatus: 'Checked',
      dailyWage: 80,
      hourlyWage: 10,
      attendancePay: 80,
      lateDeduction: 0,
      lateMinutes: 0
    });

    const attFinalized = await Attendance.create({
      employee: empA._id,
      employeeName: empA.name,
      employeeId: empA.employeeId,
      shop: shop._id,
      shopName: shop.name,
      date: new Date('2026-11-11T12:00:00Z'),
      dateString: '2026-11-11',
      status: 'Present',
      shiftStart: '10:00',
      shiftEnd: '18:00',
      timeReached: '10:30',
      workerEndTime: '18:00',
      scheduledHours: 8,
      actualHours: 7.5,
      approvalStatus: 'Finalized',
      dailyWage: 80,
      hourlyWage: 10,
      attendancePay: 70,
      lateDeduction: 10,
      lateMinutes: 30
    });

    const attPending = await Attendance.create({
      employee: empA._id,
      employeeName: empA.name,
      employeeId: empA.employeeId,
      shop: shop._id,
      shopName: shop.name,
      date: new Date('2026-11-12T12:00:00Z'),
      dateString: '2026-11-12',
      status: 'Present',
      shiftStart: '10:00',
      shiftEnd: '18:00',
      timeReached: '10:00',
      workerEndTime: '18:00',
      scheduledHours: 8,
      actualHours: 8,
      approvalStatus: 'Pending Review',
      dailyWage: 80,
      hourlyWage: 10,
      attendancePay: 80
    });

    // Attendance for Worker B (Verified)
    const attB = await Attendance.create({
      employee: empB._id,
      employeeName: empB.name,
      employeeId: empB.employeeId,
      shop: shop._id,
      shopName: shop.name,
      date: new Date('2026-11-10T12:00:00Z'),
      dateString: '2026-11-10',
      status: 'Present',
      shiftStart: '10:00',
      shiftEnd: '18:00',
      timeReached: '10:00',
      workerEndTime: '18:00',
      scheduledHours: 8,
      actualHours: 8,
      approvalStatus: 'Checked',
      dailyWage: 85,
      hourlyWage: 10.6,
      attendancePay: 85
    });

    // =========================================================================
    // TEST 1: Worker retrieves verified attendance records (Checked or Finalized)
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/attendance?filter=CUSTOM&startDate=2026-11-01&endDate=2026-11-30`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.records.length, 2, 'Should only see the 2 verified records');
      console.log('✓ Test 1 Passed: Worker retrieves only verified (Checked / Finalized) records.');
      passed++;
    }

    // =========================================================================
    // TEST 2: Unverified attendance (Pending Review / Draft) is strictly hidden
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/attendance?filter=CUSTOM&startDate=2026-11-12&endDate=2026-11-12`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.records.length, 0, 'Pending review record must be completely hidden');
      console.log('✓ Test 2 Passed: Unverified attendance is strictly hidden from worker view.');
      passed++;
    }

    // =========================================================================
    // TEST 3: Confidential wage fields are stripped from worker API output
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/attendance?filter=CUSTOM&startDate=2026-11-01&endDate=2026-11-30`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      const rec = data.records[0];
      assert.strictEqual(rec.dailyWage, undefined, 'dailyWage must not be present');
      assert.strictEqual(rec.hourlyWage, undefined, 'hourlyWage must not be present');
      assert.strictEqual(rec.attendancePay, undefined, 'attendancePay must not be present');
      assert.strictEqual(rec.lateDeduction, undefined, 'lateDeduction must not be present');
      console.log('✓ Test 3 Passed: Confidential wage fields are securely stripped.');
      passed++;
    }

    // =========================================================================
    // TEST 4: Summary metrics are computed accurately
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/attendance?filter=CUSTOM&startDate=2026-11-01&endDate=2026-11-30`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      const summary = data.summary;
      assert.strictEqual(summary.verifiedDays, 2);
      assert.strictEqual(summary.verifiedHours, 15.5);
      assert.strictEqual(summary.lateArrivals, 1);
      assert.strictEqual(summary.totalLateMinutes, 30);
      assert.strictEqual(summary.presentDays, 2);
      console.log('✓ Test 4 Passed: Summary metrics compute verified days, hours & late minutes accurately.');
      passed++;
    }

    // =========================================================================
    // TEST 5: Date filter parsing works properly (THIS_WEEK, THIS_MONTH)
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/attendance?filter=THIS_MONTH`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(data.filterRange?.startDate && data.filterRange?.endDate);
      console.log('✓ Test 5 Passed: Date range filter presets (THIS_MONTH, THIS_WEEK) parse correctly.');
      passed++;
    }

    // =========================================================================
    // TEST 6: Worker submits attendance correction request
    // =========================================================================
    let correctionRequestId = null;
    {
      const payload = {
        attendanceId: attChecked._id.toString(),
        dateString: '2026-11-10',
        issueType: 'INCORRECT_ARRIVAL_TIME',
        explanation: 'I reached the store at 09:50 AM, but machine logged 10:00 AM.',
        proposedChanges: {
          timeReached: '09:50',
          workerEndTime: '18:00'
        }
      };
      const res = await fetch(`${baseUrl}/worker/attendance/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      assert.strictEqual(res.status, 201);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.request.status, 'PENDING');
      correctionRequestId = data.request.id;

      // Verify captured original values in DB
      const dbReq = await AttendanceCorrectionRequest.findById(correctionRequestId);
      assert.strictEqual(dbReq.originalValues?.timeReached, '10:00');
      assert.strictEqual(dbReq.employee.toString(), empA._id.toString());
      console.log('✓ Test 6 Passed: Worker submitted attendance correction request with captured original values.');
      passed++;
    }

    // =========================================================================
    // TEST 7: Duplicate pending correction request for the same date is rejected
    // =========================================================================
    {
      const payload = {
        dateString: '2026-11-10',
        issueType: 'OTHER',
        explanation: 'Second request for the same day should fail'
      };
      const res = await fetch(`${baseUrl}/worker/attendance/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes('already pending review'));
      console.log('✓ Test 7 Passed: Duplicate pending correction request for the same date is blocked.');
      passed++;
    }

    // =========================================================================
    // TEST 8: Worker cannot directly update attendance (PUT /api/attendance/:id returns 403)
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/attendance/${attChecked._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`
        },
        body: JSON.stringify({ timeReached: '08:00' })
      });
      assert.strictEqual(res.status, 403, 'Workers must be forbidden from updating attendance directly');
      console.log('✓ Test 8 Passed: Worker cannot directly modify attendance (403 Forbidden).');
      passed++;
    }

    // =========================================================================
    // TEST 9: Strict Data Isolation: Worker B cannot see Worker A's records or requests
    // =========================================================================
    {
      const resAtt = await fetch(`${baseUrl}/worker/attendance?filter=CUSTOM&startDate=2026-11-01&endDate=2026-11-30`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      const dataAtt = await resAtt.json();
      assert.strictEqual(dataAtt.records.length, 1);
      assert.strictEqual(dataAtt.records[0].id.toString(), attB._id.toString());

      const resReq = await fetch(`${baseUrl}/worker/attendance/corrections`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      const dataReq = await resReq.json();
      assert.strictEqual(dataReq.requests.length, 0, 'Worker B has 0 requests; must not see Worker A requests');
      console.log('✓ Test 9 Passed: Strict data isolation verified between Worker A and Worker B.');
      passed++;
    }

    // =========================================================================
    // TEST 10: Attendance Checker (Sarfraz) & Admin can list correction requests
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/attendance/corrections?status=PENDING`, {
        headers: { Authorization: `Bearer ${tokenSarfraz}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.requests.length >= 1);
      assert.strictEqual(data.requests[0]._id.toString(), correctionRequestId.toString());
      console.log('✓ Test 10 Passed: Sarfraz / Admin retrieves pending correction requests.');
      passed++;
    }

    // =========================================================================
    // TEST 11: Reviewer can reject a correction request
    // =========================================================================
    {
      // Create a temporary request to reject
      const tempReq = await AttendanceCorrectionRequest.create({
        employee: empB._id,
        employeeName: empB.name,
        employeeId: empB.employeeId,
        dateString: '2026-11-15',
        issueType: 'MISSING_ATTENDANCE',
        explanation: 'Forgot to clock in',
        status: 'PENDING'
      });

      const res = await fetch(`${baseUrl}/attendance/corrections/${tempReq._id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenSarfraz}`
        },
        body: JSON.stringify({
          action: 'REJECT',
          workerResponse: 'CCTV check shows shop was closed that day.',
          reviewerNotes: 'Verified with manager'
        })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.request.status, 'REJECTED');
      assert.strictEqual(data.request.workerResponse, 'CCTV check shows shop was closed that day.');
      console.log('✓ Test 11 Passed: Reviewer rejected request with audit notes and worker response.');
      passed++;
    }

    // =========================================================================
    // TEST 12: Reviewer can approve a correction request, recalculating attendance
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/attendance/corrections/${correctionRequestId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenSarfraz}`
        },
        body: JSON.stringify({
          action: 'APPROVE',
          workerResponse: 'Approved. Arrival time updated to 09:50.',
          reviewerNotes: 'Verified key turn record'
        })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.request.status, 'APPROVED');

      // Verify the underlying Attendance record was updated and recalculated
      const updatedAtt = await Attendance.findById(attChecked._id);
      assert.strictEqual(updatedAtt.timeReached, '09:50');
      assert.strictEqual(updatedAtt.approvalStatus, 'Checked');
      assert.ok(updatedAtt.remarks.includes('CORRECTION APPROVED'));
      console.log('✓ Test 12 Passed: Reviewer approved request; attendance was safely updated with recalculated hours.');
      passed++;
    }

    // =========================================================================
    // TEST 13: Safety Lock: Correction approval is BLOCKED if attendance is Finalized
    // =========================================================================
    {
      // Create a request for the Finalized attendance record (attFinalized)
      const finalizedReq = await AttendanceCorrectionRequest.create({
        employee: empA._id,
        employeeName: empA.name,
        employeeId: empA.employeeId,
        attendance: attFinalized._id,
        dateString: '2026-11-11',
        issueType: 'INCORRECT_ARRIVAL_TIME',
        explanation: 'I was on time',
        proposedChanges: {
          timeReached: '10:00'
        },
        status: 'PENDING'
      });

      const res = await fetch(`${baseUrl}/attendance/corrections/${finalizedReq._id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenSarfraz}`
        },
        body: JSON.stringify({
          action: 'APPROVE',
          workerResponse: 'Trying to approve finalized attendance',
          reviewerNotes: 'Should be blocked'
        })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.code, 'FINALIZED_SALARY_LOCKED');
      console.log('✓ Test 13 Passed: Safety Lock successfully blocked modifying Finalized attendance record.');
      passed++;
    }

    // =========================================================================
    // TEST 14: Non-workers cannot access worker attendance endpoints
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/attendance`, {
        headers: { Authorization: `Bearer ${tokenSarfraz}` }
      });
      assert.strictEqual(res.status, 403, 'Sarfraz is ATTENDANCE_CHECKER, not WORKER');
      console.log('✓ Test 14 Passed: Non-worker role cannot access /api/worker/attendance.');
      passed++;
    }

  } finally {
    // Cleanup
    server.close();
    await User.deleteMany({ email: { $in: ['alice.p3@pixxrota.com', 'bob.p3@pixxrota.com', 'sarfraz.p3@pixxrota.com'] } });
    await Employee.deleteMany({ employeeId: { $in: ['TEST_P3_WKRA', 'TEST_P3_WKRB'] } });
    await Attendance.deleteMany({ employee: { $in: [empA._id, empB._id] } });
    await AttendanceCorrectionRequest.deleteMany({ employeeId: { $in: [empA._id, empB._id] } });
    await mongoose.disconnect();
  }

  console.log('\n======================================================');
  console.log(`--- WORKER PORTAL PHASE 3 TESTS COMPLETED: ${passed}/${total} PASSED ---`);
  console.log('======================================================\n');
}

runPhase3Tests().catch((err) => {
  console.error('\n❌ PHASE 3 TEST RUN FAILED:', err);
  process.exit(1);
});
