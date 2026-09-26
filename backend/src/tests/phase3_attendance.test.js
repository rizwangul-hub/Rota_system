const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db');
const Shop = require('../models/Shop');
const ShopSchedule = require('../models/ShopSchedule');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const app = require('../index');

async function runPhase3Tests() {
  console.log('====================================================');
  console.log('  PIXXTECHNOLOGIES ROTA SYSTEM — PHASE 3 TEST SUITE ');
  console.log('  Daily Attendance Workflow & Calculation Engine     ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 12;

  try {
    await connectDB();
    await new Promise(resolve => setTimeout(resolve, 800));
    const baseUrl = `http://127.0.0.1:${process.env.PORT || 5000}/api`;

    // 0. Setup test users and tokens
    const adminUser = await User.findOne({ username: 'admin' });
    const usmanUser = await User.findOne({ username: 'usman' });
    const sarfrazUser = await User.findOne({ username: 'sarfraz' });

    if (!adminUser || !usmanUser || !sarfrazUser) {
      throw new Error('Required seeded users (admin/usman/sarfraz) missing. Run npm run seed first.');
    }

    const adminToken = jwt.sign(
      { id: adminUser._id, username: adminUser.username, role: adminUser.role },
      process.env.JWT_SECRET || 'fallback_secret_key_12345',
      { expiresIn: '2h' }
    );

    const usmanToken = jwt.sign(
      { id: usmanUser._id, username: usmanUser.username, role: usmanUser.role },
      process.env.JWT_SECRET || 'fallback_secret_key_12345',
      { expiresIn: '2h' }
    );

    const sarfrazToken = jwt.sign(
      { id: sarfrazUser._id, username: sarfrazUser.username, role: sarfrazUser.role },
      process.env.JWT_SECRET || 'fallback_secret_key_12345',
      { expiresIn: '2h' }
    );

    const stationShop = await Shop.findOne({ name: 'Station' });
    const camdenShop = await Shop.findOne({ name: 'Camden' });

    if (!stationShop || !camdenShop) {
      throw new Error('Required seeded shops missing.');
    }

    // Create isolated test employee
    const testEmpId = `PH3_${Date.now().toString().slice(-4)}`;
    const testEmployee = await Employee.create({
      name: 'Usman Test Worker',
      employeeId: testEmpId,
      assignedShop: stationShop._id,
      dailyWage: 50,
      employmentStatus: 'Active'
    });

    // ----------------------------------------------------
    // TEST 1 — On time arrival (09:00 arrival, shift 09:00-19:00)
    // ----------------------------------------------------
    console.log('[TEST 1] Testing On-time arrival: 09:00 arrival on 09:00-19:00 shift (£50 wage)...');
    const res1 = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({
        employeeId: testEmployee._id,
        shopId: stationShop._id,
        date: '2026-05-11', // Monday
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:00',
        workerEndTime: '19:00'
      })
    });
    const d1 = await res1.json();
    const r1 = d1.record;

    if (res1.status === 200 && r1 && r1.lateMinutes === 0 && r1.lateDeduction === 0 && r1.attendancePay === 50 && r1.status === 'Present') {
      console.log('✓ PASS: On-time recorded: Late=0m, Deduction=£0.00, Pay=£50.00, Status=Present.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 1 failed:', res1.status, r1);
    }

    // ----------------------------------------------------
    // TEST 2 — 10 minutes late (09:10 arrival, within 15m grace)
    // ----------------------------------------------------
    console.log('\n[TEST 2] Testing 10 minutes late arrival (09:10, within 15-minute tolerance)...');
    const res2 = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({
        employeeId: testEmployee._id,
        shopId: stationShop._id,
        date: '2026-05-12', // Tuesday
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:10',
        workerEndTime: '19:00'
      })
    });
    const d2 = await res2.json();
    const r2 = d2.record;

    if (res2.status === 200 && r2 && r2.lateMinutes === 10 && r2.lateDeduction === 0 && r2.attendancePay === 50) {
      console.log('✓ PASS: 10m late tolerated under grace: Late=10m, Deduction=£0.00, Pay=£50.00.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 2 failed:', res2.status, r2);
    }

    // ----------------------------------------------------
    // TEST 3 — 15 minutes late (09:15 arrival, exact boundary of tolerance)
    // ----------------------------------------------------
    console.log('\n[TEST 3] Testing 15 minutes late arrival (09:15, exact threshold boundary)...');
    const res3 = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({
        employeeId: testEmployee._id,
        shopId: stationShop._id,
        date: '2026-05-13', // Wednesday
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:15',
        workerEndTime: '19:00'
      })
    });
    const d3 = await res3.json();
    const r3 = d3.record;

    if (res3.status === 200 && r3 && r3.lateMinutes === 15 && r3.lateDeduction === 0 && r3.attendancePay === 50) {
      console.log('✓ PASS: 15m late tolerated at boundary: Late=15m, Deduction=£0.00, Pay=£50.00.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 3 failed:', res3.status, r3);
    }

    // ----------------------------------------------------
    // TEST 4 — 16 minutes late (09:16 arrival, exceeds grace -> full 16m deduction)
    // ----------------------------------------------------
    console.log('\n[TEST 4] Testing 16 minutes late arrival (09:16, exceeds 15m -> full 16m deduction)...');
    const res4 = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({
        employeeId: testEmployee._id,
        shopId: stationShop._id,
        date: '2026-05-14', // Thursday
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:16',
        workerEndTime: '19:00'
      })
    });
    const d4 = await res4.json();
    const r4 = d4.record;
    // Hourly rate = £50 / 10 = £5.00; 16 mins = 16/60 * 5 = £1.33; Pay = £50 - 1.33 = £48.67
    const expectedDeduction16 = 1.33;
    const expectedPay16 = 48.67;

    if (res4.status === 200 && r4 && r4.lateMinutes === 16 && r4.lateDeduction === expectedDeduction16 && r4.attendancePay === expectedPay16) {
      console.log(`✓ PASS: 16m late correctly calculated from full 16m: Late=16m, Deduction=£${r4.lateDeduction}, Pay=£${r4.attendancePay}.`);
      passed++;
    } else {
      console.error('✗ FAIL: Test 4 failed:', res4.status, r4);
    }

    // ----------------------------------------------------
    // TEST 5 — 30 minutes late (09:30 arrival, £2.50 deduction, £47.50 pay)
    // ----------------------------------------------------
    console.log('\n[TEST 5] Testing 30 minutes late arrival (09:30 arrival -> £2.50 deduction, £47.50 pay)...');
    const res5 = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({
        employeeId: testEmployee._id,
        shopId: stationShop._id,
        date: '2026-05-15', // Friday
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:30',
        workerEndTime: '19:00'
      })
    });
    const d5 = await res5.json();
    const r5 = d5.record;

    if (res5.status === 200 && r5 && r5.lateMinutes === 30 && r5.lateDeduction === 2.5 && r5.attendancePay === 47.5) {
      console.log('✓ PASS: 30m late correctly calculated: Late=30m, Deduction=£2.50, Pay=£47.50.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 5 failed:', res5.status, r5);
    }

    // ----------------------------------------------------
    // TEST 6 — Actual worked hours calculation (09:30 - 19:00 -> 9.5 hours)
    // ----------------------------------------------------
    console.log('\n[TEST 6] Testing Actual Worked Hours calculation (09:30 in to 19:00 out = 9.5 hrs)...');
    if (r5 && r5.actualHours === 9.5 && r5.scheduledHours === 10) {
      console.log('✓ PASS: Actual worked hours correctly computed as 9.5 hours (Scheduled: 10 hrs).');
      passed++;
    } else {
      console.error('✗ FAIL: Test 6 failed:', r5?.actualHours);
    }

    // ----------------------------------------------------
    // TEST 7 — Different shop schedules for Saturday & Sunday
    // ----------------------------------------------------
    console.log('\n[TEST 7] Testing dynamic schedules for Saturday (09:00-18:00) and Sunday (11:00-17:00)...');
    const satRes = await fetch(`${baseUrl}/shops/default-shift?date=2026-05-16&shopId=${stationShop._id}`, {
      headers: { Authorization: `Bearer ${usmanToken}` }
    });
    const satData = await satRes.json();

    const sunRes = await fetch(`${baseUrl}/shops/default-shift?date=2026-05-17&shopId=${stationShop._id}`, {
      headers: { Authorization: `Bearer ${usmanToken}` }
    });
    const sunData = await sunRes.json();

    const satValid = satData.shiftStart === '09:00' && satData.shiftEnd === '18:00' && satData.defaultHours === 9;
    const sunValid = sunData.shiftStart === '11:00' && sunData.shiftEnd === '17:00' && sunData.defaultHours === 6;

    if (satValid && sunValid) {
      console.log('✓ PASS: Saturday (09:00–18:00, 9h) and Sunday (11:00–17:00, 6h) schedules loaded automatically.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 7 failed:', { satData, sunData });
    }

    // ----------------------------------------------------
    // TEST 8 — Historical Wage Snapshot Integrity
    // ----------------------------------------------------
    console.log('\n[TEST 8] Testing Historical Wage Snapshot: change wage £50 -> £60, verify old attendance keeps £50...');
    // Change employee daily wage to £60
    await fetch(`${baseUrl}/employees/${testEmployee._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ dailyWage: 60, wageChangeReason: 'Wage raise test' })
    });

    // Create a new shift on Saturday May 16th with new wage rate
    const res8 = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({
        employeeId: testEmployee._id,
        shopId: stationShop._id,
        date: '2026-05-16',
        shiftStart: '09:00',
        shiftEnd: '18:00',
        timeReached: '09:00',
        workerEndTime: '18:00'
      })
    });
    const d8 = await res8.json();

    // Re-query old Friday May 15th attendance
    const oldRec = await Attendance.findById(r5._id);

    if (oldRec.dailyWage === 50 && oldRec.attendancePay === 47.5 && d8.record.dailyWage === 60 && d8.record.attendancePay === 60) {
      console.log('✓ PASS: Historical wage preserved: May 15th attendance remains £50, new May 16th attendance uses £60.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 8 failed:', { oldWage: oldRec?.dailyWage, newWage: d8.record?.dailyWage });
    }

    // ----------------------------------------------------
    // TEST 9 — Historical Shop Snapshot Integrity
    // ----------------------------------------------------
    console.log('\n[TEST 9] Testing Historical Shop Snapshot: move employee Station -> Camden, verify old attendance keeps Station...');
    await fetch(`${baseUrl}/employees/${testEmployee._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ assignedShop: camdenShop._id, shopChangeReason: 'Transfer test' })
    });

    // Create attendance at Camden on May 17th
    const res9 = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({
        employeeId: testEmployee._id,
        shopId: camdenShop._id,
        date: '2026-05-17',
        shiftStart: '11:00',
        shiftEnd: '17:00',
        timeReached: '11:00',
        workerEndTime: '17:00'
      })
    });
    const d9 = await res9.json();

    const fetchedOldStation = await Attendance.findById(r5._id);

    if (
      fetchedOldStation.shop.toString() === stationShop._id.toString() &&
      fetchedOldStation.shopName === 'Station' &&
      d9.record.shop.toString() === camdenShop._id.toString() &&
      d9.record.shopName === 'Camden'
    ) {
      console.log('✓ PASS: Historical shop preserved: past attendance retained Station, new attendance recorded Camden.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 9 failed:', { oldShop: fetchedOldStation?.shopName, newShop: d9.record?.shopName });
    }

    // ----------------------------------------------------
    // TEST 10 — Duplicate Protection / Safe Upsert
    // ----------------------------------------------------
    console.log('\n[TEST 10] Testing Duplicate Protection: saving duplicate attendance for same date updates record without creating duplicate...');
    const initialCount = await Attendance.countDocuments({ employee: testEmployee._id, dateString: '2026-05-11' });

    // Save again on May 11 with updated remarks
    const res10 = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({
        employeeId: testEmployee._id,
        shopId: stationShop._id,
        date: '2026-05-11',
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:00',
        workerEndTime: '19:00',
        remarks: 'Updated remarks via operator'
      })
    });
    const d10 = await res10.json();
    const postCount = await Attendance.countDocuments({ employee: testEmployee._id, dateString: '2026-05-11' });

    if (initialCount === 1 && postCount === 1 && d10.record.remarks === 'Updated remarks via operator') {
      console.log('✓ PASS: Duplicate prevented: attendance record safely updated in-place without creating duplicates.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 10 failed:', { initialCount, postCount });
    }

    // ----------------------------------------------------
    // TEST 11 — Locked / Approved Attendance Protection
    // ----------------------------------------------------
    console.log('\n[TEST 11] Testing Locking Protection: Sarfraz checks/approves record, verifying Usman is blocked from modifying it...');
    // Sarfraz approves the May 11 attendance
    await fetch(`${baseUrl}/attendance/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sarfrazToken}` },
      body: JSON.stringify({ ids: [d10.record._id] })
    });

    // Usman attempts to edit approved record
    const lockedRes = await fetch(`${baseUrl}/attendance/${d10.record._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({ timeReached: '11:00' })
    });

    // Usman attempts to overwrite via save endpoint
    const lockedSaveRes = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({
        employeeId: testEmployee._id,
        shopId: stationShop._id,
        date: '2026-05-11',
        timeReached: '12:00'
      })
    });

    if (lockedRes.status === 403 && lockedSaveRes.status === 403) {
      console.log('✓ PASS: Locked protection enforced: Usman received 403 Forbidden attempting to modify approved attendance.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 11 failed:', { putStatus: lockedRes.status, postStatus: lockedSaveRes.status });
    }

    // ----------------------------------------------------
    // TEST 12 — RBAC Security Enforcement
    // ----------------------------------------------------
    console.log('\n[TEST 12] Testing RBAC Security: Usman blocked from admin actions (e.g. employee creation, approving attendance)...');
    const usmanAdminAction = await fetch(`${baseUrl}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({ name: 'Illegal Employee' })
    });

    const usmanApproveAction = await fetch(`${baseUrl}/attendance/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({ ids: [r1._id] })
    });

    const unauthReq = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: testEmployee._id })
    });

    if (usmanAdminAction.status === 403 && usmanApproveAction.status === 403 && unauthReq.status === 401) {
      console.log('✓ PASS: RBAC enforced: Usman blocked from employee mutation (403) and approvals (403); unauthenticated rejected (401).');
      passed++;
    } else {
      console.error('✗ FAIL: Test 12 failed:', {
        empStatus: usmanAdminAction.status,
        apprStatus: usmanApproveAction.status,
        unauthStatus: unauthReq.status
      });
    }

    // Clean up test employee & created attendances
    await Attendance.deleteMany({ employee: testEmployee._id });
    await Employee.deleteOne({ _id: testEmployee._id });

    console.log('\n====================================================');
    console.log(`  PHASE 3 TESTS RESULT: ${passed} / ${total} PASSED`);
    console.log('====================================================\n');

    await mongoose.connection.close();
    process.exit(passed === total ? 0 : 1);
  } catch (err) {
    console.error('Exception during Phase 3 tests:', err);
    await mongoose.connection.close();
    process.exit(1);
  }
}

runPhase3Tests();
