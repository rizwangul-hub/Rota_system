/**
 * Automated Test Suite: Worker Portal Phase 4 (My Weekly Rota & Shift Confirmation)
 *
 * Verifies:
 * 1. Worker retrieves published weekly rota with their own assigned shifts
 * 2. Draft rota (status: 'DRAFT') is strictly hidden from worker view (published: false)
 * 3. Strict Data Isolation: Worker B cannot see Worker A's shifts or vice versa
 * 4. Multi-shop assignments: Worker working at different shops on different days is correctly formatted
 * 5. Weekly navigation: query parameter ?weekStart=YYYY-MM-DD returns the requested week
 * 6. Historical published rotas display correctly with their publication timestamp
 * 7. Scheduled working hours, total shifts, working days, and days off are calculated accurately
 * 8. Day-off display: days with no scheduled shifts are marked as isDayOff: true with zero hours
 * 9. Worker acknowledges a published rota (POST /api/worker/rota/acknowledge)
 * 10. Duplicate acknowledgement is handled idempotently without corrupting data
 * 11. Updated / republished rota invalidates previous acknowledgement (status: UPDATE_REQUIRED, hasChanged: true)
 * 12. Worker re-acknowledges the revised rota, updating status to ACKNOWLEDGED
 * 13. Workers cannot modify or publish rotas (POST/PUT on admin rota endpoints returns 403 Forbidden)
 * 14. Non-workers cannot access worker rota endpoints (403 Forbidden)
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
const WeeklyRota = require('../models/WeeklyRota');
const { JWT_SECRET } = require('../middleware/auth');
const { getUKDateString, getWeekRange } = require('../utils/calc');

async function runPhase4Tests() {
  console.log('\n======================================================');
  console.log('--- RUNNING WORKER PORTAL PHASE 4 WEEKLY ROTA TESTS ---');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const todayStr = getUKDateString();
  const currentWeek = getWeekRange(todayStr);

  // Setup test shops
  let shopA = await Shop.findOne({ code: 'TST_P4_A' });
  if (!shopA) {
    shopA = await Shop.create({ name: 'Station Branch Test', code: 'TST_P4_A', address: '1 Station Rd, London', phone: '02071234567' });
  }

  let shopB = await Shop.findOne({ code: 'TST_P4_B' });
  if (!shopB) {
    shopB = await Shop.create({ name: 'Camden Branch Test', code: 'TST_P4_B', address: '42 Camden High St, London', phone: '02077654321' });
  }

  // Setup test employees
  let empA = await Employee.findOne({ employeeId: 'TEST_P4_WKRA' });
  if (!empA) {
    empA = await Employee.create({
      employeeId: 'TEST_P4_WKRA',
      name: 'Alice Phase4',
      email: 'alice.phase4@pixxrota.com',
      dailyWage: 80,
      assignedShop: shopA._id,
      employmentStatus: 'Active'
    });
  }

  let empB = await Employee.findOne({ employeeId: 'TEST_P4_WKRB' });
  if (!empB) {
    empB = await Employee.create({
      employeeId: 'TEST_P4_WKRB',
      name: 'Bob Phase4',
      email: 'bob.phase4@pixxrota.com',
      dailyWage: 85,
      assignedShop: shopB._id,
      employmentStatus: 'Active'
    });
  }

  // Clean & create User accounts
  await User.deleteMany({ email: { $in: ['alice.p4@pixxrota.com', 'bob.p4@pixxrota.com', 'admin.p4@pixxrota.com'] } });

  const userA = await User.create({
    name: 'Alice Phase4',
    username: 'alice.p4@pixxrota.com',
    email: 'alice.p4@pixxrota.com',
    password: 'Password123!',
    role: 'WORKER',
    employee: empA._id,
    assignedShop: shopA._id,
    isActive: true
  });

  const userB = await User.create({
    name: 'Bob Phase4',
    username: 'bob.p4@pixxrota.com',
    email: 'bob.p4@pixxrota.com',
    password: 'Password123!',
    role: 'WORKER',
    employee: empB._id,
    assignedShop: shopB._id,
    isActive: true
  });

  const userAdmin = await User.create({
    name: 'Admin Phase4',
    username: 'admin.p4@pixxrota.com',
    email: 'admin.p4@pixxrota.com',
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

  // Setup test rotas (using specific test dates to avoid collision with live schedules)
  const testWeekStart = '2026-12-06'; // Sunday
  const testWeekEnd = '2026-12-12';   // Saturday

  const draftWeekStart = '2026-12-13'; // Sunday
  const draftWeekEnd = '2026-12-19';   // Saturday

  await WeeklyRota.deleteMany({ weekStart: { $in: [testWeekStart, draftWeekStart] } });

  let passed = 0;
  let total = 14;

  try {
    // -------------------------------------------------------------
    // CREATE PUBLISHED ROTA WITH MULTI-SHOP SHIFTS
    // Alice: Sunday at Shop A (11:00-17:00, 6h), Monday at Shop B (09:00-19:00, 10h) -> 2 shifts, 16h
    // Bob: Tuesday at Shop B (09:00-19:00, 10h)
    // -------------------------------------------------------------
    const publishedRota = await WeeklyRota.create({
      weekStart: testWeekStart,
      weekEnd: testWeekEnd,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-12-05T10:00:00Z'),
      publishedVersions: [
        {
          version: 1,
          assignments: [],
          staffingTargets: [],
          generationMethod: 'MANUAL',
          publishedAt: new Date('2026-12-05T10:00:00Z'),
          publishedBy: userAdmin._id
        }
      ],
      assignments: [
        {
          employeeId: empA._id,
          shopId: shopA._id,
          dateKey: '2026-12-06', // Sunday
          startTime: '11:00',
          endTime: '17:00',
          scheduledHours: 6,
          status: 'AVAILABLE',
          note: 'Opening shift at Station'
        },
        {
          employeeId: empA._id,
          shopId: shopB._id,
          dateKey: '2026-12-07', // Monday (Different shop!)
          startTime: '09:00',
          endTime: '19:00',
          scheduledHours: 10,
          status: 'AVAILABLE',
          note: 'Covering Camden'
        },
        {
          employeeId: empB._id,
          shopId: shopB._id,
          dateKey: '2026-12-08', // Tuesday
          startTime: '09:00',
          endTime: '19:00',
          scheduledHours: 10,
          status: 'AVAILABLE'
        }
      ]
    });

    // CREATE DRAFT ROTA FOR NEXT WEEK (Should be HIDDEN)
    await WeeklyRota.create({
      weekStart: draftWeekStart,
      weekEnd: draftWeekEnd,
      status: 'DRAFT',
      assignments: [
        {
          employeeId: empA._id,
          shopId: shopA._id,
          dateKey: '2026-12-14',
          startTime: '09:00',
          endTime: '17:00',
          scheduledHours: 8,
          status: 'AVAILABLE'
        }
      ]
    });

    // =========================================================================
    // TEST 1: Worker retrieves their own published rota
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/rota?weekStart=${testWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.published, true);
      assert.strictEqual(data.weekStart, testWeekStart);
      assert.strictEqual(data.summary.totalShifts, 2);
      console.log('✓ Test 1 Passed: Worker retrieves published rota with their assignments.');
      passed++;
    }

    // =========================================================================
    // TEST 2: Draft rota is strictly hidden from worker view
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/rota?weekStart=${draftWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.published, false, 'Draft rota must be marked published: false');
      assert.strictEqual(data.summary.totalShifts, 0);
      assert.strictEqual(data.days.every(d => d.isDayOff), true, 'All days in unpublished week must show as Day Off');
      console.log('✓ Test 2 Passed: Draft rotas are strictly shielded from worker view.');
      passed++;
    }

    // =========================================================================
    // TEST 3: Strict Data Isolation: Worker B cannot see Worker A's shifts
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/rota?weekStart=${testWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.summary.totalShifts, 1, 'Worker B should only have 1 shift');
      assert.strictEqual(data.summary.totalHours, 10);
      const bShifts = data.days.flatMap(d => d.shifts);
      assert.strictEqual(bShifts.length, 1);
      assert.strictEqual(bShifts[0].startTime, '09:00');
      console.log('✓ Test 3 Passed: Strict data isolation verified between workers.');
      passed++;
    }

    // =========================================================================
    // TEST 4: Multi-shop assignments display correctly
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/rota?weekStart=${testWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      const sunDay = data.days.find(d => d.dateKey === '2026-12-06');
      const monDay = data.days.find(d => d.dateKey === '2026-12-07');

      assert.strictEqual(sunDay.shifts[0].shopName, 'Station Branch Test');
      assert.strictEqual(sunDay.shifts[0].shopAddress, '1 Station Rd, London');
      assert.strictEqual(monDay.shifts[0].shopName, 'Camden Branch Test');
      assert.strictEqual(data.summary.shopsCount, 2, 'Worker assigned to 2 distinct branches');
      console.log('✓ Test 4 Passed: Multi-shop assignments and branch metadata display correctly.');
      passed++;
    }

    // =========================================================================
    // TEST 5: Week navigation: query parameter ?weekStart returns correct week
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/rota?weekStart=${testWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(data.weekStart, testWeekStart);
      assert.ok(data.prevWeekStart && data.nextWeekStart);
      console.log('✓ Test 5 Passed: Weekly navigation parameter parsing works correctly.');
      passed++;
    }

    // =========================================================================
    // TEST 6: Historical published rotas display correctly with publishedAt date
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/rota?weekStart=${testWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.ok(data.publishedAt, 'Published rota must include publishedAt timestamp');
      assert.strictEqual(data.publishedVersion, 1);
      console.log('✓ Test 6 Passed: Historical published rota includes publication timestamp.');
      passed++;
    }

    // =========================================================================
    // TEST 7: Scheduled working hours, total shifts & days off calculate accurately
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/rota?weekStart=${testWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      const summary = data.summary;
      assert.strictEqual(summary.totalShifts, 2);
      assert.strictEqual(summary.totalHours, 16);
      assert.strictEqual(summary.workingDays, 2);
      assert.strictEqual(summary.daysOff, 5); // 7 - 2 = 5
      console.log('✓ Test 7 Passed: Working hours, shift counts and days off calculated accurately.');
      passed++;
    }

    // =========================================================================
    // TEST 8: Day-off display works correctly
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/rota?weekStart=${testWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      const wednesday = data.days.find(d => d.dateKey === '2026-12-09');
      assert.strictEqual(wednesday.isDayOff, true);
      assert.strictEqual(wednesday.shifts.length, 0);
      assert.strictEqual(wednesday.label, 'Day Off');
      console.log('✓ Test 8 Passed: Unassigned days are marked cleanly as Day Off.');
      passed++;
    }

    // =========================================================================
    // TEST 9: Worker acknowledges a published rota
    // =========================================================================
    {
      // Initially, acknowledgement status should be PENDING_ACKNOWLEDGEMENT
      const initialRes = await fetch(`${baseUrl}/worker/rota?weekStart=${testWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const initialData = await initialRes.json();
      assert.strictEqual(initialData.acknowledgement.status, 'PENDING_ACKNOWLEDGEMENT');
      assert.strictEqual(initialData.acknowledgement.isAcknowledged, false);

      // Submit acknowledgement
      const ackRes = await fetch(`${baseUrl}/worker/rota/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`
        },
        body: JSON.stringify({ rotaId: publishedRota._id })
      });
      const ackData = await ackRes.json();
      assert.strictEqual(ackRes.status, 200);
      assert.strictEqual(ackData.success, true);
      assert.strictEqual(ackData.acknowledgement.status, 'ACKNOWLEDGED');

      // Verify re-fetching shows ACKNOWLEDGED
      const verifiedRes = await fetch(`${baseUrl}/worker/rota?weekStart=${testWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const verifiedData = await verifiedRes.json();
      assert.strictEqual(verifiedData.acknowledgement.status, 'ACKNOWLEDGED');
      assert.strictEqual(verifiedData.acknowledgement.isAcknowledged, true);
      console.log('✓ Test 9 Passed: Worker acknowledged weekly rota successfully.');
      passed++;
    }

    // =========================================================================
    // TEST 10: Duplicate acknowledgement is idempotent
    // =========================================================================
    {
      const ackRes = await fetch(`${baseUrl}/worker/rota/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`
        },
        body: JSON.stringify({ weekStart: testWeekStart })
      });
      const ackData = await ackRes.json();
      assert.strictEqual(ackRes.status, 200);
      assert.strictEqual(ackData.success, true);

      // Verify only 1 acknowledgement record exists in DB for this employee
      const dbRota = await WeeklyRota.findById(publishedRota._id);
      const acksForWorker = dbRota.acknowledgements.filter(a => a.employeeId.toString() === empA._id.toString());
      assert.strictEqual(acksForWorker.length, 1, 'Should have exactly one acknowledgement entry');
      console.log('✓ Test 10 Passed: Duplicate acknowledgement handled idempotently.');
      passed++;
    }

    // =========================================================================
    // TEST 11: Updated / republished rota invalidates previous acknowledgement
    // =========================================================================
    {
      // Management republishes rota with version 2 and a newer publishedAt timestamp
      const newPublishDate = new Date(Date.now() + 10000);
      await WeeklyRota.updateOne(
        { _id: publishedRota._id },
        {
          $set: { publishedAt: newPublishDate },
          $push: {
            publishedVersions: {
              version: 2,
              assignments: [],
              staffingTargets: [],
              generationMethod: 'MANUAL',
              publishedAt: newPublishDate,
              publishedBy: userAdmin._id
            }
          }
        }
      );

      // Worker checks rota: should now see UPDATE_REQUIRED and hasChanged: true
      const res = await fetch(`${baseUrl}/worker/rota?weekStart=${testWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const data = await res.json();
      assert.strictEqual(data.acknowledgement.status, 'UPDATE_REQUIRED');
      assert.strictEqual(data.acknowledgement.hasChanged, true);
      assert.strictEqual(data.acknowledgement.isAcknowledged, false);
      console.log('✓ Test 11 Passed: Revised rota correctly invalidates previous acknowledgement (UPDATE_REQUIRED).');
      passed++;
    }

    // =========================================================================
    // TEST 12: Worker re-acknowledges the revised rota
    // =========================================================================
    {
      const ackRes = await fetch(`${baseUrl}/worker/rota/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`
        },
        body: JSON.stringify({ rotaId: publishedRota._id })
      });
      const ackData = await ackRes.json();
      assert.strictEqual(ackRes.status, 200);
      assert.strictEqual(ackData.success, true);
      assert.strictEqual(ackData.acknowledgement.status, 'ACKNOWLEDGED');

      // Verify status is now restored to ACKNOWLEDGED
      const verifiedRes = await fetch(`${baseUrl}/worker/rota?weekStart=${testWeekStart}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const verifiedData = await verifiedRes.json();
      assert.strictEqual(verifiedData.acknowledgement.status, 'ACKNOWLEDGED');
      assert.strictEqual(verifiedData.acknowledgement.hasChanged, false);
      assert.strictEqual(verifiedData.acknowledgement.isAcknowledged, true);
      console.log('✓ Test 12 Passed: Worker successfully re-acknowledged updated rota schedule.');
      passed++;
    }

    // =========================================================================
    // TEST 13: Workers cannot modify or publish rotas (403 Forbidden)
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/rota/week/${testWeekStart}/draft`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`
        },
        body: JSON.stringify({ assignments: [] })
      });
      assert.strictEqual(res.status, 403, 'Workers must be forbidden from editing rotas');
      console.log('✓ Test 13 Passed: Worker cannot modify or publish rotas (403 Forbidden).');
      passed++;
    }

    // =========================================================================
    // TEST 14: Non-workers cannot access worker rota endpoints
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/worker/rota`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` }
      });
      assert.strictEqual(res.status, 403, 'Admin cannot access /api/worker/rota directly');
      console.log('✓ Test 14 Passed: Non-worker role cannot access /api/worker/rota.');
      passed++;
    }

  } finally {
    // Cleanup
    server.close();
    await User.deleteMany({ email: { $in: ['alice.p4@pixxrota.com', 'bob.p4@pixxrota.com', 'admin.p4@pixxrota.com'] } });
    await Employee.deleteMany({ employeeId: { $in: ['TEST_P4_WKRA', 'TEST_P4_WKRB'] } });
    await Shop.deleteMany({ code: { $in: ['TST_P4_A', 'TST_P4_B'] } });
    await WeeklyRota.deleteMany({ weekStart: { $in: [testWeekStart, draftWeekStart] } });
    await mongoose.disconnect();
  }

  console.log('\n======================================================');
  console.log(`--- WORKER PORTAL PHASE 4 TESTS COMPLETED: ${passed}/${total} PASSED ---`);
  console.log('======================================================\n');
}

runPhase4Tests().catch((err) => {
  console.error('\n❌ PHASE 4 TEST RUN FAILED:', err);
  process.exit(1);
});
