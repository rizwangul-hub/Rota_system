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
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { getWeekRange } = require('../utils/calc');
const app = require('../index');

async function runPhase5Tests() {
  console.log('===========================================================');
  console.log('  PIXXTECHNOLOGIES ROTA SYSTEM — PHASE 5 TEST SUITE        ');
  console.log('  Weekly Salary Calculation Engine & Admin Review          ');
  console.log('===========================================================\n');

  let passed = 0;
  const total = 15;

  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    await new Promise(resolve => setTimeout(resolve, 800));
    const baseUrl = `http://127.0.0.1:${process.env.PORT || 5000}/api`;

    // 0. Setup test users and tokens
    const adminUser = await User.findOne({ username: 'admin' });
    const usmanUser = await User.findOne({ username: 'usman' });
    const sarfrazUser = await User.findOne({ username: 'sarfraz' });
    const distributorUser = await User.findOne({ username: 'distributor' });

    if (!adminUser || !usmanUser || !sarfrazUser) {
      throw new Error('Required seeded users missing. Run npm run seed first.');
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

    const uniqueSuffix = Date.now().toString().slice(-4);

    // ----------------------------------------------------
    // TEST 1 — Sunday-Saturday Week Calculation (Requirement 1 & 2)
    // ----------------------------------------------------
    console.log('[TEST 1] Testing automatic Sunday–Saturday week range from 06/08/2026...');
    const weekCalc = getWeekRange('2026-08-06'); // Thursday 6 August 2026
    const expectedLabel = '02/08/2026 – 08/08/2026';
    const isSunToSat = weekCalc.weekLabel === expectedLabel &&
      weekCalc.startDateString === '2026-08-02' &&
      weekCalc.endDateString === '2026-08-08';

    if (isSunToSat) {
      console.log(`✓ PASS: getWeekRange('2026-08-06') resolved: ${weekCalc.weekLabel} (Sun: ${weekCalc.startDateString}, Sat: ${weekCalc.endDateString})`);
      passed++;
    } else {
      console.error('✗ FAIL: Test 1 failed:', weekCalc);
    }

    // Create isolated test employee for weekly calculation
    const testEmp = await Employee.create({
      name: `John Smith ${uniqueSuffix}`,
      employeeId: `JS_${uniqueSuffix}`,
      assignedShop: stationShop._id,
      dailyWage: 50,
      employmentStatus: 'Active'
    });

    const testWeekDate = '2026-08-05'; // Wednesday in week 03/08/2026 – 09/08/2026

    // ----------------------------------------------------
    // TEST 2 — Week Info & Pending Attendance Check (Requirement 3, 22, 24)
    // ----------------------------------------------------
    console.log('[TEST 2] Creating 3 checked records and 1 pending record to verify pending attendance warning...');
    // Create 3 checked records (Mon, Tue, Wed)
    await Attendance.create([
      {
        employee: testEmp._id,
        employeeName: testEmp.name,
        employeeId: testEmp.employeeId,
        shop: stationShop._id,
        shopName: stationShop.name,
        date: new Date('2026-08-03T12:00:00Z'),
        dateString: '2026-08-03',
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:00',
        workerEndTime: '19:00',
        scheduledHours: 10,
        actualHours: 10,
        lateMinutes: 0,
        lateDeduction: 0,
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 50,
        status: 'Present',
        approvalStatus: 'Checked'
      },
      {
        employee: testEmp._id,
        employeeName: testEmp.name,
        employeeId: testEmp.employeeId,
        shop: stationShop._id,
        shopName: stationShop.name,
        date: new Date('2026-08-04T12:00:00Z'),
        dateString: '2026-08-04',
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:30',
        workerEndTime: '19:00',
        scheduledHours: 10,
        actualHours: 9.5,
        lateMinutes: 30,
        lateDeduction: 2.5,
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 47.5,
        status: 'Late',
        approvalStatus: 'Checked'
      },
      {
        employee: testEmp._id,
        employeeName: testEmp.name,
        employeeId: testEmp.employeeId,
        shop: stationShop._id,
        shopName: stationShop.name,
        date: new Date('2026-08-05T12:00:00Z'),
        dateString: '2026-08-05',
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:00',
        workerEndTime: '19:00',
        scheduledHours: 10,
        actualHours: 10,
        lateMinutes: 0,
        lateDeduction: 0,
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 50,
        status: 'Present',
        approvalStatus: 'Checked'
      },
      // 1 Pending Review record (Thu)
      {
        employee: testEmp._id,
        employeeName: testEmp.name,
        employeeId: testEmp.employeeId,
        shop: stationShop._id,
        shopName: stationShop.name,
        date: new Date('2026-08-06T12:00:00Z'),
        dateString: '2026-08-06',
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:00',
        workerEndTime: '19:00',
        scheduledHours: 10,
        actualHours: 10,
        lateMinutes: 0,
        lateDeduction: 0,
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 50,
        status: 'Present',
        approvalStatus: 'Pending Review'
      }
    ]);

    const res2 = await fetch(`${baseUrl}/salaries/week-info?date=${testWeekDate}&shopId=${stationShop._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const d2 = await res2.json();

    if (res2.status === 200 && d2.checkedCount >= 3 && d2.pendingCount === 1 && d2.warning) {
      console.log(`✓ PASS: week-info correctly identified checked records (${d2.checkedCount}) and 1 pending record with warning: "${d2.warning}"`);
      passed++;
    } else {
      console.error('✗ FAIL: Test 2 failed:', res2.status, d2);
    }

    // ----------------------------------------------------
    // TEST 3 — Only Checked Attendance Included (Pending Excluded) (Requirement 3, 32)
    // ----------------------------------------------------
    console.log('[TEST 3] Generating weekly salary: verifying ONLY checked records enter payroll...');
    const res3 = await fetch(`${baseUrl}/salaries/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ date: testWeekDate, shopId: stationShop._id })
    });
    const d3 = await res3.json();
    const sal3 = d3.salaries?.find(s => s.employeeId === testEmp.employeeId);

    // Mon £50 + Tue £47.50 + Wed £50 = £147.50 (Thu £50 is pending and must be excluded!)
    if (res3.status === 200 && sal3 && sal3.workingDays === 3 && sal3.netAttendancePay === 147.5) {
      console.log(`✓ PASS: Pending record excluded: workingDays=3, netAttendancePay=£147.50, Gross=£150.00, Ded=£2.50.`);
      passed++;
    } else {
      console.error('✗ FAIL: Test 3 failed:', res3.status, d3, sal3);
    }

    // ----------------------------------------------------
    // TEST 4 — Canonical Double-Calculation Test (Requirement 5, 6, 28)
    // ----------------------------------------------------
    console.log('[TEST 4] Canonical Double-Calculation Test: 5 days (£50, £47.50, £50, £50, £40 = £237.50)...');
    // Approve Thursday record (£50) and add Friday record (£40 pay, £10 deduction)
    await Attendance.updateOne({ employee: testEmp._id, dateString: '2026-08-06' }, { $set: { approvalStatus: 'Checked' } });
    await Attendance.create({
      employee: testEmp._id,
      employeeName: testEmp.name,
      employeeId: testEmp.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      date: new Date('2026-08-07T12:00:00Z'),
      dateString: '2026-08-07',
      shiftStart: '09:00',
      shiftEnd: '19:00',
      timeReached: '11:00', // 2 hours late = 120 mins -> £10 deduction
      workerEndTime: '19:00',
      scheduledHours: 10,
      actualHours: 8,
      lateMinutes: 120,
      lateDeduction: 10,
      dailyWage: 50,
      hourlyWage: 5,
      attendancePay: 40,
      status: 'Late',
      approvalStatus: 'Checked'
    });

    const res4 = await fetch(`${baseUrl}/salaries/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ date: testWeekDate, shopId: stationShop._id })
    });
    const d4 = await res4.json();
    const sal4 = d4.salaries?.find(s => s.employeeId === testEmp.employeeId);

    // Expected: Gross £250.00, Late deductions £12.50, Attendance Pay £237.50 (NO DOUBLE DEDUCTION)
    if (
      res4.status === 200 &&
      sal4 &&
      sal4.workingDays === 5 &&
      sal4.grossDailyWages === 250 &&
      sal4.lateDeductions === 12.5 &&
      sal4.netAttendancePay === 237.5 &&
      sal4.finalSalary === 237.5
    ) {
      console.log('✓ PASS: Double-deduction prevented: Gross=£250.00 - LateDed=£12.50 = NetPay=£237.50.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 4 failed:', res4.status, sal4);
    }

    // ----------------------------------------------------
    // TEST 5 — Duplicate Generation Protection (Requirement 16, 31)
    // ----------------------------------------------------
    console.log('[TEST 5] Clicking "Generate Weekly Salary" again to test duplicate protection...');
    const res5 = await fetch(`${baseUrl}/salaries/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ date: testWeekDate, shopId: stationShop._id })
    });
    const d5 = await res5.json();

    const count5 = await WeeklySalary.countDocuments({
      employee: testEmp._id,
      weekLabel: '03/08/2026 – 09/08/2026'
    });
    const sal5 = await WeeklySalary.findOne({
      employee: testEmp._id,
      weekLabel: '03/08/2026 – 09/08/2026'
    });

    if (res5.status === 200 && count5 === 1 && sal5.netAttendancePay === 237.5) {
      console.log('✓ PASS: Duplicate prevented: Exactly 1 WeeklySalary record exists with net pay £237.50.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 5 duplicate check failed:', count5, sal5);
    }

    // ----------------------------------------------------
    // TEST 6 — Historical Wage Snapshot Test (Requirement 12, 29)
    // ----------------------------------------------------
    console.log('[TEST 6] Historical Wage Snapshot: Mon £50, Tue £50, wage changes £50 -> £60, Wed £60...');
    const wageEmp = await Employee.create({
      name: `Wage Worker ${uniqueSuffix}`,
      employeeId: `WW_${uniqueSuffix}`,
      assignedShop: stationShop._id,
      dailyWage: 50,
      employmentStatus: 'Active'
    });

    const wageWeekDate = '2026-08-12'; // Week 10/08/2026 – 16/08/2026
    // Monday (£50) and Tuesday (£50) under £50 rate
    await Attendance.create([
      {
        employee: wageEmp._id,
        employeeName: wageEmp.name,
        employeeId: wageEmp.employeeId,
        shop: stationShop._id,
        shopName: stationShop.name,
        date: new Date('2026-08-10T12:00:00Z'),
        dateString: '2026-08-10',
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:00',
        workerEndTime: '19:00',
        scheduledHours: 10,
        actualHours: 10,
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 50,
        status: 'Present',
        approvalStatus: 'Checked'
      },
      {
        employee: wageEmp._id,
        employeeName: wageEmp.name,
        employeeId: wageEmp.employeeId,
        shop: stationShop._id,
        shopName: stationShop.name,
        date: new Date('2026-08-11T12:00:00Z'),
        dateString: '2026-08-11',
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:00',
        workerEndTime: '19:00',
        scheduledHours: 10,
        actualHours: 10,
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 50,
        status: 'Present',
        approvalStatus: 'Checked'
      }
    ]);

    // Change employee daily wage to £60
    await Employee.updateOne({ _id: wageEmp._id }, { $set: { dailyWage: 60 } });

    // Wednesday under £60 rate
    await Attendance.create({
      employee: wageEmp._id,
      employeeName: wageEmp.name,
      employeeId: wageEmp.employeeId,
      shop: stationShop._id,
      shopName: stationShop.name,
      date: new Date('2026-08-12T12:00:00Z'),
      dateString: '2026-08-12',
      shiftStart: '09:00',
      shiftEnd: '19:00',
      timeReached: '09:00',
      workerEndTime: '19:00',
      scheduledHours: 10,
      actualHours: 10,
      dailyWage: 60,
      hourlyWage: 6,
      attendancePay: 60,
      status: 'Present',
      approvalStatus: 'Checked'
    });

    const res6 = await fetch(`${baseUrl}/salaries/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ date: wageWeekDate })
    });
    const d6 = await res6.json();
    const sal6 = d6.salaries?.find(s => s.employeeId === wageEmp.employeeId);

    // Expected Gross = £50 + £50 + £60 = £160.00 (or if 3 days £160; NOT £60 * 3 = £180!)
    if (res6.status === 200 && sal6 && sal6.grossDailyWages === 160 && sal6.netAttendancePay === 160) {
      console.log(`✓ PASS: Historical wage preserved: Gross=£160.00 (£50 + £50 + £60), NOT £180.00 (£60 × 3).`);
      passed++;
    } else {
      console.error('✗ FAIL: Test 6 historical wage check failed:', sal6);
    }

    // ----------------------------------------------------
    // TEST 7 — Historical Shop Transfer Test (Requirement 11, 30)
    // ----------------------------------------------------
    console.log('[TEST 7] Shop Transfer Test: Mon & Tue at Station, Wed at Camden...');
    const transferEmp = await Employee.create({
      name: `Transfer Worker ${uniqueSuffix}`,
      employeeId: `TW_${uniqueSuffix}`,
      assignedShop: stationShop._id,
      dailyWage: 50,
      employmentStatus: 'Active'
    });

    const transferWeekDate = '2026-08-19'; // Week 17/08/2026 – 23/08/2026
    await Attendance.create([
      {
        employee: transferEmp._id,
        employeeName: transferEmp.name,
        employeeId: transferEmp.employeeId,
        shop: stationShop._id,
        shopName: stationShop.name,
        date: new Date('2026-08-17T12:00:00Z'),
        dateString: '2026-08-17',
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 50,
        status: 'Present',
        approvalStatus: 'Checked'
      },
      {
        employee: transferEmp._id,
        employeeName: transferEmp.name,
        employeeId: transferEmp.employeeId,
        shop: stationShop._id,
        shopName: stationShop.name,
        date: new Date('2026-08-18T12:00:00Z'),
        dateString: '2026-08-18',
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 50,
        status: 'Present',
        approvalStatus: 'Checked'
      },
      {
        employee: transferEmp._id,
        employeeName: transferEmp.name,
        employeeId: transferEmp.employeeId,
        shop: camdenShop._id,
        shopName: camdenShop.name,
        date: new Date('2026-08-19T12:00:00Z'),
        dateString: '2026-08-19',
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 50,
        status: 'Present',
        approvalStatus: 'Checked'
      }
    ]);

    const res7 = await fetch(`${baseUrl}/salaries/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ date: transferWeekDate })
    });
    const d7 = await res7.json();
    const sal7 = d7.salaries?.find(s => s.employeeId === transferEmp.employeeId);

    const breakdownStationCount = sal7?.attendanceBreakdown?.filter(b => b.shopName === 'Station').length;
    const breakdownCamdenCount = sal7?.attendanceBreakdown?.filter(b => b.shopName === 'Camden').length;

    if (res7.status === 200 && breakdownStationCount === 2 && breakdownCamdenCount === 1) {
      console.log(`✓ PASS: Shop history preserved in breakdown: Station=2 days, Camden=1 day.`);
      passed++;
    } else {
      console.error('✗ FAIL: Test 7 shop history failed:', sal7);
    }

    // ----------------------------------------------------
    // TEST 8 — Working Days: Half Day & Absent Handling (Requirement 7, 8, 9)
    // ----------------------------------------------------
    console.log('[TEST 8] Working Days: 1 Present (£50), 1 Half Day (£25), 1 Absent (£0)...');
    const absentEmp = await Employee.create({
      name: `Absent Worker ${uniqueSuffix}`,
      employeeId: `AW_${uniqueSuffix}`,
      assignedShop: stationShop._id,
      dailyWage: 50,
      employmentStatus: 'Active'
    });

    const statusWeekDate = '2026-08-26'; // Week 24/08/2026 – 30/08/2026
    await Attendance.create([
      {
        employee: absentEmp._id,
        employeeName: absentEmp.name,
        employeeId: absentEmp.employeeId,
        shop: stationShop._id,
        shopName: stationShop.name,
        date: new Date('2026-08-24T12:00:00Z'),
        dateString: '2026-08-24',
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 50,
        status: 'Present',
        approvalStatus: 'Checked'
      },
      {
        employee: absentEmp._id,
        employeeName: absentEmp.name,
        employeeId: absentEmp.employeeId,
        shop: stationShop._id,
        shopName: stationShop.name,
        date: new Date('2026-08-25T12:00:00Z'),
        dateString: '2026-08-25',
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 25,
        status: 'Half',
        approvalStatus: 'Checked'
      },
      {
        employee: absentEmp._id,
        employeeName: absentEmp.name,
        employeeId: absentEmp.employeeId,
        shop: stationShop._id,
        shopName: stationShop.name,
        date: new Date('2026-08-26T12:00:00Z'),
        dateString: '2026-08-26',
        dailyWage: 50,
        hourlyWage: 5,
        attendancePay: 0,
        status: 'Absent',
        approvalStatus: 'Checked'
      }
    ]);

    const res8 = await fetch(`${baseUrl}/salaries/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ date: statusWeekDate })
    });
    const d8 = await res8.json();
    const sal8 = d8.salaries?.find(s => s.employeeId === absentEmp.employeeId);

    // Working days: 2 (Present + Half, Absent excluded). Pay: £50 + £25 + £0 = £75.00
    if (res8.status === 200 && sal8 && sal8.workingDays === 2 && sal8.netAttendancePay === 75) {
      console.log('✓ PASS: Working days=2 (Absent excluded), Net Pay=£75.00 (Present £50 + Half £25 + Absent £0).');
      passed++;
    } else {
      console.error('✗ FAIL: Test 8 status test failed:', sal8);
    }

    // ----------------------------------------------------
    // TEST 9 — Regeneration of Weekly Salary (Requirement 17)
    // ----------------------------------------------------
    console.log('[TEST 9] Testing explicit regeneration of non-finalized weekly salary...');
    const res9 = await fetch(`${baseUrl}/salaries/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ date: testWeekDate })
    });
    const d9 = await res9.json();

    const regenAudit = await AuditLog.findOne({
      action: 'WEEKLY_SALARY_REGENERATED',
      user: adminUser._id
    }).sort({ timestamp: -1 });

    if (res9.status === 200 && d9.success && regenAudit) {
      console.log('✓ PASS: Weekly salary regenerated safely, AuditLog logged WEEKLY_SALARY_REGENERATED.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 9 failed:', res9.status, d9, regenAudit);
    }

    // ----------------------------------------------------
    // TEST 10 — Employee Weekly Salary Details Transparency (Requirement 20, 21)
    // ----------------------------------------------------
    console.log('[TEST 10] Testing GET /api/salaries/:id for day-by-day attendance breakdown...');
    const res10 = await fetch(`${baseUrl}/salaries/${sal4._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const d10 = await res10.json();

    const hasBreakdown = d10.salary?.attendanceBreakdown?.length === 5;
    const hasLinkedAttendances = d10.attendances?.length === 5;

    if (res10.status === 200 && hasBreakdown && hasLinkedAttendances) {
      console.log('✓ PASS: Salary details endpoint returned 5 day-by-day attendance breakdown records.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 10 failed:', res10.status, d10);
    }

    // ----------------------------------------------------
    // TEST 11 — Aggregate Totals Validation (Requirement 19)
    // ----------------------------------------------------
    console.log('[TEST 11] Testing GET /api/salaries aggregate totals...');
    const res11 = await fetch(`${baseUrl}/salaries?date=${testWeekDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const d11 = await res11.json();
    const totals = d11.totals;

    if (
      res11.status === 200 &&
      totals &&
      totals.totalEmployees >= 1 &&
      totals.totalWorkingDays >= 5 &&
      totals.totalAttendancePay >= 237.5
    ) {
      console.log(`✓ PASS: Weekly totals calculated: Staff=${totals.totalEmployees}, Days=${totals.totalWorkingDays}, Pay=£${totals.totalAttendancePay.toFixed(2)}.`);
      passed++;
    } else {
      console.error('✗ FAIL: Test 11 aggregate totals failed:', totals);
    }

    // ----------------------------------------------------
    // TEST 12 — Finalized Salary Lock Protection (Requirement 33)
    // ----------------------------------------------------
    console.log('[TEST 12] Finalizing weekly salary, verifying regeneration will NOT overwrite it...');
    await WeeklySalary.updateOne(
      { _id: sal4._id },
      { $set: { status: 'FINALIZED', finalizedBy: adminUser._id, finalizedAt: new Date() } }
    );

    const res12 = await fetch(`${baseUrl}/salaries/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ date: testWeekDate })
    });
    const d12 = await res12.json();

    const finalizedCheck = await WeeklySalary.findById(sal4._id);
    if (res12.status === 200 && finalizedCheck.status === 'FINALIZED') {
      console.log('✓ PASS: Finalized salary safely preserved; normal generation skipped overwriting it.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 12 lock test failed:', finalizedCheck);
    }

    // ----------------------------------------------------
    // TEST 13 — RBAC: Sarfraz Blocked from Salary Generation (Requirement 26)
    // ----------------------------------------------------
    console.log('[TEST 13] Testing RBAC: Sarfraz (Checker) blocked from /salaries/generate...');
    const res13 = await fetch(`${baseUrl}/salaries/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sarfrazToken}` },
      body: JSON.stringify({ date: testWeekDate })
    });
    const d13 = await res13.json();

    if (res13.status === 403) {
      console.log('✓ PASS: Sarfraz blocked from generating weekly salary with HTTP 403 Forbidden.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 13 expected 403 but got:', res13.status, d13);
    }

    // ----------------------------------------------------
    // TEST 14 — RBAC: Usman Blocked from Weekly Salary (Requirement 26)
    // ----------------------------------------------------
    console.log('[TEST 14] Testing RBAC: Usman (Operator) blocked from /salaries...');
    const res14 = await fetch(`${baseUrl}/salaries?date=${testWeekDate}`, {
      headers: { Authorization: `Bearer ${usmanToken}` }
    });
    const d14 = await res14.json();

    if (res14.status === 403) {
      console.log('✓ PASS: Usman blocked from viewing weekly salaries with HTTP 403 Forbidden.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 14 expected 403 but got:', res14.status, d14);
    }

    // ----------------------------------------------------
    // TEST 15 — Unauthenticated Access Rejection (Requirement 26)
    // ----------------------------------------------------
    console.log('[TEST 15] Testing unauthenticated access rejection (no token)...');
    const res15 = await fetch(`${baseUrl}/salaries/week-info`);
    if (res15.status === 401) {
      console.log('✓ PASS: Unauthenticated request rejected with HTTP 401 Unauthorized.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 15 expected 401 but got:', res15.status);
    }

    // Clean up test data
    const testEmpIds = [testEmp._id, wageEmp._id, transferEmp._id, absentEmp._id];
    await Attendance.deleteMany({ employee: { $in: testEmpIds } });
    await WeeklySalary.deleteMany({ employee: { $in: testEmpIds } });
    await Employee.deleteMany({ _id: { $in: testEmpIds } });

  } catch (err) {
    console.error('UNEXPECTED PHASE 5 TEST ERROR:', err);
  } finally {
    console.log('\n===========================================================');
    console.log(`  PHASE 5 TEST RESULTS: ${passed} / ${total} PASSED`);
    console.log('===========================================================');
    if (passed === total) {
      console.log('🎉 ALL PHASE 5 WEEKLY SALARY ENGINE REQUIREMENTS FULLY VERIFIED!\n');
    } else {
      console.error(`⚠️  SOME TESTS FAILED: ${total - passed} failure(s).\n`);
    }
    process.exit(passed === total ? 0 : 1);
  }
}

runPhase5Tests();
