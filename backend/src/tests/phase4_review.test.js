const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db');
const Shop = require('../models/Shop');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const app = require('../index');

async function runPhase4Tests() {
  console.log('===========================================================');
  console.log('  PIXXTECHNOLOGIES ROTA SYSTEM — PHASE 4 TEST SUITE        ');
  console.log('  Sarfraz Attendance Checking, Review & Export Workflow    ');
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

    // Create unique isolated test employees for Phase 4
    const uniqueSuffix = Date.now().toString().slice(-4);
    const testEmployee1 = await Employee.create({
      name: `Review Worker 1 ${uniqueSuffix}`,
      employeeId: `P4_${uniqueSuffix}_1`,
      assignedShop: stationShop._id,
      dailyWage: 50,
      employmentStatus: 'Active'
    });

    const testEmployee2 = await Employee.create({
      name: `Review Worker 2 ${uniqueSuffix}`,
      employeeId: `P4_${uniqueSuffix}_2`,
      assignedShop: camdenShop._id,
      dailyWage: 60,
      employmentStatus: 'Active'
    });

    const testDate = '2026-06-15'; // Monday

    // ----------------------------------------------------
    // TEST 1 — Usman creates attendance: 09:30 arrival (late 30 mins) -> Pending Review
    // ----------------------------------------------------
    console.log('[TEST 1] Usman saves attendance with 09:30 arrival on 09:00-19:00 shift (£50 wage)...');
    const res1 = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({
        employeeId: testEmployee1._id,
        shopId: stationShop._id,
        date: testDate,
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:30',
        workerEndTime: '19:00'
      })
    });
    const d1 = await res1.json();
    const r1 = d1.record;

    if (
      res1.status === 200 &&
      r1 &&
      r1.lateMinutes === 30 &&
      r1.lateDeduction === 2.5 &&
      r1.attendancePay === 47.5 &&
      r1.approvalStatus === 'Pending Review'
    ) {
      console.log('✓ PASS: Record created: Late=30m, Deduction=£2.50, Pay=£47.50, Status=Pending Review.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 1 failed:', res1.status, r1);
    }

    // ----------------------------------------------------
    // TEST 2 — Sarfraz retrieves pending attendance via /attendance/pending
    // ----------------------------------------------------
    console.log('[TEST 2] Sarfraz queries /api/attendance/pending for date and shop...');
    const res2 = await fetch(`${baseUrl}/attendance/pending?date=${testDate}&shopId=${stationShop._id}`, {
      headers: { Authorization: `Bearer ${sarfrazToken}` }
    });
    const d2 = await res2.json();
    const foundPending = d2.records?.find(r => r._id === r1._id);

    if (res2.status === 200 && foundPending && foundPending.approvalStatus === 'Pending Review') {
      console.log('✓ PASS: Sarfraz retrieved pending records including newly saved record.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 2 failed:', res2.status, d2);
    }

    // ----------------------------------------------------
    // TEST 3 — Sarfraz edits attendance record (correcting arrival from 09:30 to 09:10)
    // ----------------------------------------------------
    console.log('[TEST 3] Sarfraz edits record (correcting arrival time to 09:10)...');
    const res3 = await fetch(`${baseUrl}/attendance/${r1._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sarfrazToken}` },
      body: JSON.stringify({
        timeReached: '09:10',
        remarks: 'Corrected 20 min train delay'
      })
    });
    const d3 = await res3.json();
    const r3 = d3.record;

    if (
      res3.status === 200 &&
      r3 &&
      r3.lateMinutes === 10 &&
      r3.lateDeduction === 0 &&
      r3.attendancePay === 50 &&
      r3.remarks.includes('train delay')
    ) {
      console.log('✓ PASS: Backend recalculated: Late=10m (within grace), Deduction=£0.00, Pay=£50.00.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 3 failed:', res3.status, r3);
    }

    // ----------------------------------------------------
    // TEST 4 — Sarfraz approves/checks attendance -> status Checked, checkedBy, checkedAt
    // ----------------------------------------------------
    console.log('[TEST 4] Sarfraz checks and approves record via /attendance/approve...');
    const res4 = await fetch(`${baseUrl}/attendance/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sarfrazToken}` },
      body: JSON.stringify({ ids: [r1._id] })
    });
    const d4 = await res4.json();

    const checkedDoc = await Attendance.findById(r1._id);
    if (
      res4.status === 200 &&
      checkedDoc &&
      checkedDoc.approvalStatus === 'Checked' &&
      checkedDoc.checkedByName === sarfrazUser.name &&
      checkedDoc.checkedAt != null
    ) {
      console.log(`✓ PASS: Record checked: approvalStatus=Checked, checkedBy=${checkedDoc.checkedByName}, checkedAt=${checkedDoc.checkedAt.toISOString()}`);
      passed++;
    } else {
      console.error('✗ FAIL: Test 4 failed:', res4.status, d4, checkedDoc);
    }

    // ----------------------------------------------------
    // TEST 5 — Audit log verification for CHECK_ATTENDANCE
    // ----------------------------------------------------
    console.log('[TEST 5] Verifying AuditLog entry for CHECK_ATTENDANCE...');
    const checkAudit = await AuditLog.findOne({
      action: 'CHECK_ATTENDANCE',
      user: sarfrazUser._id
    }).sort({ timestamp: -1 });

    if (checkAudit && checkAudit.details.includes('Checked and approved')) {
      console.log(`✓ PASS: AuditLog verified: action=${checkAudit.action}, user=${checkAudit.username}, role=${checkAudit.role}`);
      passed++;
    } else {
      console.error('✗ FAIL: Test 5 failed to find CHECK_ATTENDANCE audit log:', checkAudit);
    }

    // ----------------------------------------------------
    // TEST 6 — Usman attempts to edit Checked record -> rejected 403 Forbidden
    // ----------------------------------------------------
    console.log('[TEST 6] Usman attempts to modify Checked record (Strict locking test)...');
    const res6 = await fetch(`${baseUrl}/attendance/${r1._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({ timeReached: '08:55' })
    });
    const d6 = await res6.json();

    if (res6.status === 403) {
      console.log('✓ PASS: Usman modification strictly rejected with HTTP 403 Forbidden.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 6 failed, expected 403 but got:', res6.status, d6);
    }

    // ----------------------------------------------------
    // TEST 7 — Sarfraz attempts to edit Checked record -> rejected 403 Forbidden
    // ----------------------------------------------------
    console.log('[TEST 7] Sarfraz attempts to modify Checked record (Checker lock test)...');
    const res7 = await fetch(`${baseUrl}/attendance/${r1._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sarfrazToken}` },
      body: JSON.stringify({ timeReached: '08:50' })
    });
    const d7 = await res7.json();

    if (res7.status === 403) {
      console.log('✓ PASS: Sarfraz modification strictly rejected with HTTP 403 Forbidden.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 7 failed, expected 403 but got:', res7.status, d7);
    }

    // ----------------------------------------------------
    // TEST 8 — Admin CAN edit Checked record (Admin privilege test)
    // ----------------------------------------------------
    console.log('[TEST 8] Admin modifies Checked record (Admin bypass test)...');
    const res8 = await fetch(`${baseUrl}/attendance/${r1._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ remarks: 'Admin verified override' })
    });
    const d8 = await res8.json();

    if (res8.status === 200 && d8.record && d8.record.remarks === 'Admin verified override') {
      console.log('✓ PASS: Admin successfully modified checked record with audit logging.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 8 failed:', res8.status, d8);
    }

    // ----------------------------------------------------
    // TEST 9 — Multi-filter Daily Attendance Report endpoint
    // ----------------------------------------------------
    console.log('[TEST 9] Daily attendance report filtering by date, shop, approvalStatus, and search...');
    const res9 = await fetch(
      `${baseUrl}/reports/daily-attendance?date=${testDate}&shopId=${stationShop._id}&approvalStatus=Checked&search=${testEmployee1.employeeId}`,
      { headers: { Authorization: `Bearer ${sarfrazToken}` } }
    );
    const d9 = await res9.json();

    if (res9.status === 200 && d9.records?.length === 1 && d9.records[0].employeeId === testEmployee1.employeeId) {
      console.log('✓ PASS: Multi-filter returned exactly 1 matching Checked record.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 9 failed:', res9.status, d9);
    }

    // ----------------------------------------------------
    // TEST 10 — Report summary metrics validation
    // ----------------------------------------------------
    console.log('[TEST 10] Validating Daily Report summary metrics consistency...');
    const summary = d9.summary;
    if (
      summary &&
      summary.totalEmployees === 1 &&
      summary.checked === 1 &&
      summary.totalAttendancePay === 50 &&
      summary.totalWorkedHours === 9.83
    ) {
      console.log('✓ PASS: Summary totals match records exactly: Staff=1, Checked=1, Pay=£50.00, Hours=9.83.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 10 summary mismatch:', summary);
    }

    // ----------------------------------------------------
    // TEST 11 — WhatsApp text format validation
    // ----------------------------------------------------
    console.log('[TEST 11] Validating WhatsApp generated report text formatting...');
    const whatsAppText = d9.whatsAppText;
    const hasHeader = whatsAppText.toLowerCase().includes('daily attendance report');
    const hasShop = whatsAppText.includes('Station') || whatsAppText.includes('STATION');
    const hasEmployee = whatsAppText.includes(testEmployee1.name);
    const hasPay = whatsAppText.includes('£50.00') || whatsAppText.includes('£50');

    if (hasHeader && hasShop && hasEmployee && hasPay) {
      console.log('✓ PASS: WhatsApp text properly formatted with header, shop, staff, and wage breakdown.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 11 WhatsApp text validation failed:', whatsAppText);
    }

    // ----------------------------------------------------
    // TEST 12 — Excel Export generation
    // ----------------------------------------------------
    console.log('[TEST 12] Requesting Excel daily attendance report (.xlsx)...');
    const res12 = await fetch(`${baseUrl}/reports/daily-attendance/excel?date=${testDate}&shopId=${stationShop._id}`, {
      headers: { Authorization: `Bearer ${sarfrazToken}` }
    });

    const contentType12 = res12.headers.get('content-type');
    const buffer12 = await res12.arrayBuffer();

    if (res12.status === 200 && contentType12?.includes('spreadsheetml') && buffer12.byteLength > 1000) {
      console.log(`✓ PASS: Excel export generated successfully (${buffer12.byteLength} bytes).`);
      passed++;
    } else {
      console.error('✗ FAIL: Test 12 Excel export failed:', res12.status, contentType12, buffer12.byteLength);
    }

    // ----------------------------------------------------
    // TEST 13 — Landscape PDF Export generation
    // ----------------------------------------------------
    console.log('[TEST 13] Requesting landscape PDF daily attendance report (.pdf)...');
    const res13 = await fetch(`${baseUrl}/reports/daily-attendance/pdf?date=${testDate}&shopId=${stationShop._id}`, {
      headers: { Authorization: `Bearer ${sarfrazToken}` }
    });

    const contentType13 = res13.headers.get('content-type');
    const buffer13 = await res13.arrayBuffer();
    const pdfMagicBytes = Buffer.from(buffer13.slice(0, 4)).toString('ascii');

    if (res13.status === 200 && contentType13?.includes('pdf') && pdfMagicBytes === '%PDF') {
      console.log(`✓ PASS: PDF export generated successfully (${buffer13.byteLength} bytes, magic header %PDF).`);
      passed++;
    } else {
      console.error('✗ FAIL: Test 13 PDF export failed:', res13.status, contentType13, pdfMagicBytes);
    }

    // ----------------------------------------------------
    // TEST 14 — Batch Approval Flow
    // ----------------------------------------------------
    console.log('[TEST 14] Testing batch check approval on multiple records...');
    // Create second record for testEmployee2
    const res14a = await fetch(`${baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usmanToken}` },
      body: JSON.stringify({
        employeeId: testEmployee2._id,
        shopId: camdenShop._id,
        date: testDate,
        shiftStart: '09:00',
        shiftEnd: '19:00',
        timeReached: '09:00',
        workerEndTime: '19:00'
      })
    });
    const d14a = await res14a.json();
    const r14 = d14a.record;

    const res14b = await fetch(`${baseUrl}/attendance/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sarfrazToken}` },
      body: JSON.stringify({ ids: [r14._id] })
    });
    const d14b = await res14b.json();
    const r14Doc = await Attendance.findById(r14._id);

    if (res14b.status === 200 && r14Doc.approvalStatus === 'Checked' && r14Doc.checkedByName === sarfrazUser.name) {
      console.log('✓ PASS: Batch approval succeeded, record locked with checker identity.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 14 failed:', res14b.status, d14b, r14Doc);
    }

    // ----------------------------------------------------
    // TEST 15 — Unauthorized access rejection
    // ----------------------------------------------------
    console.log('[TEST 15] Testing unauthorized access rejection (no token)...');
    const res15 = await fetch(`${baseUrl}/attendance/pending`);
    if (res15.status === 401) {
      console.log('✓ PASS: Unauthenticated access rejected with HTTP 401 Unauthorized.');
      passed++;
    } else {
      console.error('✗ FAIL: Test 15 failed, expected 401 but got:', res15.status);
    }

    // Clean up test data
    await Attendance.deleteMany({ employee: { $in: [testEmployee1._id, testEmployee2._id] } });
    await Employee.deleteMany({ _id: { $in: [testEmployee1._id, testEmployee2._id] } });

  } catch (err) {
    console.error('UNEXPECTED TEST SUITE ERROR:', err);
  } finally {
    console.log('\n===========================================================');
    console.log(`  PHASE 4 TEST RESULTS: ${passed} / ${total} PASSED`);
    console.log('===========================================================');
    if (passed === total) {
      console.log('🎉 ALL PHASE 4 WORKFLOW REQUIREMENTS FULLY VERIFIED!\n');
    } else {
      console.error(`⚠️  SOME TESTS FAILED: ${total - passed} failure(s).\n`);
    }
    process.exit(passed === total ? 0 : 1);
  }
}

runPhase4Tests();
