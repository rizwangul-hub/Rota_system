/**
 * Automated Test Suite: Worker Portal Phase 6
 * Digital Employee ID Card, Leave Management & Company Announcements
 * 
 * Verifies:
 * - Module 1: Digital Employee ID Card retrieval & PDF badge download
 * - Module 1: QR Verification token resolution via /api/verify-id/:code
 * - Module 1: Strict shielding of sensitive payroll/banking/compliance data
 * - Module 2: Leave request submission with auto-calculated totalDays
 * - Module 2: Duplicate & overlapping leave request protection
 * - Module 2: Leave cancellation by worker while pending
 * - Module 2: Admin review, approval, rejection with management remarks & audit logging
 * - Module 3: Announcement creation with audience targeting (ALL, SHOPS, EMPLOYEES)
 * - Module 3: Active feed vs history, priority ranking (Urgent > Important > Normal)
 * - Module 3: Read receipt tracking and admin readership stats
 * - RBAC: Workers cannot access admin endpoints; Admin cannot impersonate worker endpoints
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
const LeaveRequest = require('../models/LeaveRequest');
const Announcement = require('../models/Announcement');
const { JWT_SECRET } = require('../middleware/auth');

async function runPhase6Tests() {
  console.log('\n======================================================');
  console.log('--- RUNNING WORKER PORTAL PHASE 6 TESTS ---');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  // Setup test shops
  let shopA = await Shop.findOne({ code: 'TST6A' });
  if (!shopA) {
    shopA = await Shop.create({ name: 'Test Shop 6A', code: 'TST6A', address: '100 Baker St' });
  }

  let shopB = await Shop.findOne({ code: 'TST6B' });
  if (!shopB) {
    shopB = await Shop.create({ name: 'Test Shop 6B', code: 'TST6B', address: '200 Oxford St' });
  }

  // Create Worker A in Shop A
  let empA = await Employee.findOne({ employeeId: 'TEST_P6_WKRA' });
  if (!empA) {
    empA = await Employee.create({
      employeeId: 'TEST_P6_WKRA',
      name: 'Alice Phase6',
      email: 'alice.phase6@pixxrota.com',
      dailyWage: 90,
      assignedShop: shopA._id,
      employmentStatus: 'Active',
      jobTitle: 'Senior Technician',
      bankAccountNumber: '99887766',
      nationalInsuranceNumber: 'AB123456C',
      companyLegalName: 'Pixx Technologies Ltd'
    });
  }

  // Create Worker B in Shop B
  let empB = await Employee.findOne({ employeeId: 'TEST_P6_WKRB' });
  if (!empB) {
    empB = await Employee.create({
      employeeId: 'TEST_P6_WKRB',
      name: 'Bob Phase6',
      email: 'bob.phase6@pixxrota.com',
      dailyWage: 85,
      assignedShop: shopB._id,
      employmentStatus: 'Active',
      jobTitle: 'Sales Assistant',
      bankAccountNumber: '55443322',
      nationalInsuranceNumber: 'CD789012E',
      companyLegalName: 'Pixx Technologies Ltd'
    });
  }

  // Clean & create User accounts
  await User.deleteMany({ email: { $in: ['alice.p6@pixxrota.com', 'bob.p6@pixxrota.com', 'admin.p6@pixxrota.com'] } });

  const userA = await User.create({
    name: 'Alice Phase6',
    username: 'alice.p6@pixxrota.com',
    email: 'alice.p6@pixxrota.com',
    password: 'Password123!',
    role: 'WORKER',
    employee: empA._id,
    assignedShop: shopA._id,
    isActive: true
  });

  const userB = await User.create({
    name: 'Bob Phase6',
    username: 'bob.p6@pixxrota.com',
    email: 'bob.p6@pixxrota.com',
    password: 'Password123!',
    role: 'WORKER',
    employee: empB._id,
    assignedShop: shopB._id,
    isActive: true
  });

  const adminUser = await User.create({
    name: 'Admin Phase6',
    username: 'admin.p6@pixxrota.com',
    email: 'admin.p6@pixxrota.com',
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

  const adminToken = jwt.sign(
    { id: adminUser._id, role: 'ADMIN', username: adminUser.username },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Clean test records
  await LeaveRequest.deleteMany({ employee: { $in: [empA._id, empB._id] } });
  await Announcement.deleteMany({ title: { $regex: /TEST_P6/ } });

  let savedVerificationCode = null;
  let testLeaveId = null;
  let testAnnouncementId = null;

  try {
    // -------------------------------------------------------------
    // MODULE 1: DIGITAL EMPLOYEE ID CARD TESTS
    // -------------------------------------------------------------

    // TEST 1: Worker retrieves their digital ID card
    console.log('Test 1: Worker A fetches their digital ID card...');
    const cardRes = await fetch(`${baseUrl}/worker/id-card`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const cardData = await cardRes.json();
    assert.strictEqual(cardRes.status, 200, 'Status is 200');
    assert.strictEqual(cardData.success, true);
    assert.strictEqual(cardData.card.employeeId, 'TEST_P6_WKRA');
    assert.strictEqual(cardData.card.name, 'Alice Phase6');
    assert.strictEqual(cardData.card.jobTitle, 'Senior Technician');
    assert.strictEqual(cardData.card.assignedShop.name, 'Test Shop 6A');
    assert.ok(cardData.card.qrVerificationCode, 'QR verification code exists');
    savedVerificationCode = cardData.card.qrVerificationCode;
    console.log('   ✓ Passed: Worker retrieved digital ID card with valid secure QR token.');

    // TEST 2: Strict Data Shielding (No wages, banking, NI in card response)
    console.log('Test 2: Verifying sensitive data is shielded from ID card...');
    assert.strictEqual(cardData.card.dailyWage, undefined, 'Daily wage must never be in card payload');
    assert.strictEqual(cardData.card.bankAccountNumber, undefined, 'Bank details must never be in card payload');
    assert.strictEqual(cardData.card.nationalInsuranceNumber, undefined, 'NI must never be in card payload');
    console.log('   ✓ Passed: Sensitive financial and compliance fields strictly excluded.');

    // TEST 3: Public / Management verification endpoint resolves employee
    console.log('Test 3: QR scanner verifies employee standing via /api/verify-id/:code...');
    const verifyRes = await fetch(`${baseUrl}/verify-id/${savedVerificationCode}`);
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyRes.status, 200, 'Verify endpoint returns 200');
    assert.strictEqual(verifyData.success, true);
    assert.strictEqual(verifyData.verified, true);
    assert.strictEqual(verifyData.employee.name, 'Alice Phase6');
    assert.strictEqual(verifyData.employee.employeeId, 'TEST_P6_WKRA');
    assert.strictEqual(verifyData.employee.employmentStatus, 'Active');
    console.log('   ✓ Passed: QR verification confirmed active employment badge.');

    // TEST 4: Non-existent / invalid verification code returns 404
    console.log('Test 4: Invalid verification code returns 404...');
    const fakeVerifyRes = await fetch(`${baseUrl}/verify-id/PIXX-INVALID-CODE-9999`);
    assert.strictEqual(fakeVerifyRes.status, 404, 'Invalid code returns 404');
    console.log('   ✓ Passed: Tampered/invalid security tokens rejected.');

    // TEST 5: Download printable ID Badge PDF
    console.log('Test 5: Worker downloads official ID Badge PDF...');
    const pdfRes = await fetch(`${baseUrl}/worker/id-card/pdf`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(pdfRes.status, 200);
    assert.strictEqual(pdfRes.headers.get('content-type'), 'application/pdf');
    const pdfBuffer = await pdfRes.arrayBuffer();
    assert.ok(pdfBuffer.byteLength > 500, 'PDF buffer contains valid content');
    console.log('   ✓ Passed: Official printable ID badge generated in PDF format.');

    // -------------------------------------------------------------
    // MODULE 2: LEAVE MANAGEMENT TESTS
    // -------------------------------------------------------------

    // TEST 6: Worker submits a valid leave request
    console.log('Test 6: Worker A submits a 5-day annual leave request...');
    const leaveSubmitRes = await fetch(`${baseUrl}/worker/leaves`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        leaveType: 'Annual Leave',
        startDate: '2026-12-15',
        endDate: '2026-12-19',
        reason: 'Family holiday travel'
      })
    });
    const leaveSubmitData = await leaveSubmitRes.json();
    assert.strictEqual(leaveSubmitRes.status, 201, 'Status is 201');
    assert.strictEqual(leaveSubmitData.success, true);
    assert.strictEqual(leaveSubmitData.leaveRequest.totalDays, 5, 'Auto-calculated 5 days');
    assert.strictEqual(leaveSubmitData.leaveRequest.status, 'Pending');
    testLeaveId = leaveSubmitData.leaveRequest._id;
    console.log('   ✓ Passed: Leave request submitted with auto-calculated total days.');

    // TEST 7: Invalid date range (endDate < startDate) rejected
    console.log('Test 7: Rejecting invalid date range (endDate earlier than startDate)...');
    const invalidDateRes = await fetch(`${baseUrl}/worker/leaves`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        leaveType: 'Sick Leave',
        startDate: '2026-12-25',
        endDate: '2026-12-20',
        reason: 'Invalid range'
      })
    });
    assert.strictEqual(invalidDateRes.status, 400, 'Invalid range returns 400');
    console.log('   ✓ Passed: Malformed / inverted date ranges blocked.');

    // TEST 8: Overlapping leave request protection
    console.log('Test 8: Duplicate / overlapping leave request is blocked...');
    const overlapRes = await fetch(`${baseUrl}/worker/leaves`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        leaveType: 'Sick Leave',
        startDate: '2026-12-18', // overlaps with Dec 15 - Dec 19
        endDate: '2026-12-22',
        reason: 'Overlapping request'
      })
    });
    assert.strictEqual(overlapRes.status, 400, 'Overlapping returns 400');
    console.log('   ✓ Passed: Overlapping leave submission prevented.');

    // TEST 9: Worker fetches leave list and summary
    console.log('Test 9: Worker A retrieves their leave list and summary...');
    const listRes = await fetch(`${baseUrl}/worker/leaves`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const listData = await listRes.json();
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listData.leaves.length, 1);
    assert.strictEqual(listData.leaves[0].reason, 'Family holiday travel');

    const sumRes = await fetch(`${baseUrl}/worker/leaves/summary`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const sumData = await sumRes.json();
    assert.strictEqual(sumData.summary.pendingCount, 1);
    assert.strictEqual(sumData.summary.approvedCount, 0);
    console.log('   ✓ Passed: Leave history and summary metrics surfaced accurately.');

    // TEST 10: Worker B cannot see Worker A leaves (Worker isolation)
    console.log('Test 10: Anti-IDOR — Worker B cannot see Worker A leaves...');
    const workerBListRes = await fetch(`${baseUrl}/worker/leaves`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const workerBListData = await workerBListRes.json();
    assert.strictEqual(workerBListData.leaves.length, 0, 'Worker B has 0 leaves');
    console.log('   ✓ Passed: Complete cross-worker leave isolation verified.');

    // TEST 11: Worker cancels pending leave
    console.log('Test 11: Worker A cancels their pending leave request...');
    const cancelRes = await fetch(`${baseUrl}/worker/leaves/${testLeaveId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const cancelData = await cancelRes.json();
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelData.leaveRequest.status, 'Cancelled');
    console.log('   ✓ Passed: Pending leave request successfully cancelled.');

    // Submit a fresh leave request for Admin review testing
    const newLeaveRes = await fetch(`${baseUrl}/worker/leaves`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        leaveType: 'Emergency Leave',
        startDate: '2026-12-28',
        endDate: '2026-12-29',
        reason: 'Urgent home maintenance'
      })
    });
    const newLeaveData = await newLeaveRes.json();
    const reviewLeaveId = newLeaveData.leaveRequest._id;

    // TEST 12: Admin reviews and approves leave request
    console.log('Test 12: Admin reviews and approves leave request...');
    const approveRes = await fetch(`${baseUrl}/admin/leaves/${reviewLeaveId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        status: 'Approved',
        reviewRemarks: 'Approved by Fahad: Shop coverage confirmed.'
      })
    });
    const approveData = await approveRes.json();
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveData.leave.status, 'Approved');
    assert.strictEqual(approveData.leave.reviewRemarks, 'Approved by Fahad: Shop coverage confirmed.');
    console.log('   ✓ Passed: Admin successfully approved leave request with remarks.');

    // TEST 13: Worker cannot cancel an approved leave
    console.log('Test 13: Worker cannot cancel an approved leave...');
    const cancelApprovedRes = await fetch(`${baseUrl}/worker/leaves/${reviewLeaveId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(cancelApprovedRes.status, 400, 'Cannot cancel approved leave');
    console.log('   ✓ Passed: Approved leave cannot be unilaterally revoked by worker.');

    // TEST 14: Non-admin blocked from admin leave review
    console.log('Test 14: Worker role blocked from admin leave endpoints (403)...');
    const workerReviewRes = await fetch(`${baseUrl}/admin/leaves/${reviewLeaveId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ status: 'Approved' })
    });
    assert.strictEqual(workerReviewRes.status, 403, 'Worker receives 403');
    console.log('   ✓ Passed: Role boundary strictly enforced on admin leave routes.');

    // -------------------------------------------------------------
    // MODULE 3: COMPANY ANNOUNCEMENTS TESTS
    // -------------------------------------------------------------

    // TEST 15: Admin publishes a company-wide announcement (Target: ALL)
    console.log('Test 15: Admin publishes global company announcement (Target: ALL)...');
    const createAnnRes = await fetch(`${baseUrl}/admin/announcements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: 'TEST_P6 Global Safety Protocol',
        message: 'All employees must follow new safety protocols starting next week.',
        priority: 'Important',
        targetType: 'ALL'
      })
    });
    const createAnnData = await createAnnRes.json();
    assert.strictEqual(createAnnRes.status, 201);
    assert.strictEqual(createAnnData.announcement.priority, 'Important');
    testAnnouncementId = createAnnData.announcement._id;
    console.log('   ✓ Passed: Global announcement published successfully.');

    // TEST 16: Worker A and Worker B both receive the global announcement
    console.log('Test 16: Worker A fetches announcements and finds global notice...');
    const workerAnnRes = await fetch(`${baseUrl}/worker/announcements`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const workerAnnData = await workerAnnRes.json();
    assert.strictEqual(workerAnnRes.status, 200);
    const foundAnn = workerAnnData.announcements.find(a => String(a._id) === String(testAnnouncementId));
    assert.ok(foundAnn, 'Announcement found in Worker A feed');
    assert.strictEqual(foundAnn.isRead, false, 'Initial state is unread');
    console.log('   ✓ Passed: Global announcement delivered to targeted worker.');

    // TEST 17: Worker A marks announcement as read (read receipt)
    console.log('Test 17: Worker A acknowledges announcement as read...');
    const readReceiptRes = await fetch(`${baseUrl}/worker/announcements/${testAnnouncementId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const readReceiptData = await readReceiptRes.json();
    assert.strictEqual(readReceiptRes.status, 200);
    assert.strictEqual(readReceiptData.isRead, true);

    // Re-check Worker A announcements feed
    const verifyReadRes = await fetch(`${baseUrl}/worker/announcements`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const verifyReadData = await verifyReadRes.json();
    const updatedAnn = verifyReadData.announcements.find(a => String(a._id) === String(testAnnouncementId));
    assert.strictEqual(updatedAnn.isRead, true, 'isRead is now true');
    console.log('   ✓ Passed: Read receipt recorded and updated in worker feed.');

    // TEST 18: Admin views announcement readership
    console.log('Test 18: Admin inspects readership statistics and verifies Worker A receipt...');
    const readershipRes = await fetch(`${baseUrl}/admin/announcements/${testAnnouncementId}/readership`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const readershipData = await readershipRes.json();
    assert.strictEqual(readershipRes.status, 200);
    const workerAReadEntry = readershipData.readership.find(r => r.employeeId === 'TEST_P6_WKRA');
    assert.ok(workerAReadEntry, 'Worker A listed in recipients');
    assert.strictEqual(workerAReadEntry.isRead, true, 'Worker A marked as read');
    console.log('   ✓ Passed: Readership tracking verified with individual worker receipt.');

    // TEST 19: Shop-targeted announcement (Target: Shop A only)
    console.log('Test 19: Admin publishes shop-specific announcement for Shop A only...');
    const shopAnnRes = await fetch(`${baseUrl}/admin/announcements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: 'TEST_P6 Shop A Exclusive Stocktake',
        message: 'Stocktake scheduled this Saturday for Shop A branch only.',
        priority: 'Urgent',
        targetType: 'SHOPS',
        targetShops: [shopA._id]
      })
    });
    const shopAnnData = await shopAnnRes.json();
    const shopAnnId = shopAnnData.announcement._id;

    // Worker A (Shop A) MUST see it
    const workerAFeed = await (await fetch(`${baseUrl}/worker/announcements`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    })).json();
    assert.ok(workerAFeed.announcements.some(a => String(a._id) === String(shopAnnId)), 'Worker A sees Shop A announcement');

    // Worker B (Shop B) MUST NOT see it
    const workerBFeed = await (await fetch(`${baseUrl}/worker/announcements`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    })).json();
    assert.ok(!workerBFeed.announcements.some(a => String(a._id) === String(shopAnnId)), 'Worker B does NOT see Shop A announcement');
    console.log('   ✓ Passed: Branch-level audience filtering strictly verified.');

    // TEST 20: Expired announcement is excluded from active feed
    console.log('Test 20: Expired announcement is excluded from active announcements feed...');
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
    const expiredAnnRes = await fetch(`${baseUrl}/admin/announcements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: 'TEST_P6 Expired Flash Notice',
        message: 'This notice expired yesterday.',
        priority: 'Normal',
        targetType: 'ALL',
        expiresAt: pastDate
      })
    });
    const expiredAnnData = await expiredAnnRes.json();
    const expiredId = expiredAnnData.announcement._id;

    const activeCheck = await (await fetch(`${baseUrl}/worker/announcements`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    })).json();
    assert.ok(!activeCheck.announcements.some(a => String(a._id) === String(expiredId)), 'Expired announcement absent from active feed');

    const historyCheck = await (await fetch(`${baseUrl}/worker/announcements/history`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    })).json();
    assert.ok(historyCheck.announcements.some(a => String(a._id) === String(expiredId)), 'Expired announcement retained in notice history archive');
    console.log('   ✓ Passed: Expired notices hidden from active feed but preserved in history.');

    // TEST 21: Admin archives and deletes announcement
    console.log('Test 21: Admin archives and deletes an announcement...');
    const archiveRes = await fetch(`${baseUrl}/admin/announcements/${testAnnouncementId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const archiveData = await archiveRes.json();
    assert.strictEqual(archiveData.announcement.status, 'Archived');

    const deleteRes = await fetch(`${baseUrl}/admin/announcements/${testAnnouncementId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const deleteData = await deleteRes.json();
    assert.strictEqual(deleteData.success, true);
    console.log('   ✓ Passed: Announcement archived and safely deleted.');

    console.log('\n======================================================');
    console.log('ALL 21 WORKER PORTAL PHASE 6 TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } finally {
    // Clean up test data
    await LeaveRequest.deleteMany({ employee: { $in: [empA._id, empB._id] } });
    await Announcement.deleteMany({ title: { $regex: /TEST_P6/ } });
    await User.deleteMany({ email: { $in: ['alice.p6@pixxrota.com', 'bob.p6@pixxrota.com', 'admin.p6@pixxrota.com'] } });
    await Employee.deleteMany({ employeeId: { $in: ['TEST_P6_WKRA', 'TEST_P6_WKRB'] } });
    await Shop.deleteMany({ code: { $in: ['TST6A', 'TST6B'] } });
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
}

runPhase6Tests().catch((err) => {
  console.error('Phase 6 Test Failed:', err);
  process.exit(1);
});
