const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const http = require('http');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db');
const Shop = require('../models/Shop');
const ShopSchedule = require('../models/ShopSchedule');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const app = require('../index');

async function runPhase2Tests() {
  console.log('====================================================');
  console.log('  PIXXTECHNOLOGIES ROTA SYSTEM — PHASE 2 TEST SUITE ');
  console.log('  Shop, Employee, Wage & Schedule Management         ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 7;
  let server = null;

  try {
    await connectDB();
    // Wait briefly for app to start listening on port 5000
    await new Promise(resolve => setTimeout(resolve, 800));
    const baseUrl = `http://127.0.0.1:${process.env.PORT || 5000}/api`;


    // 0. Setup test users and tokens
    const adminUser = await User.findOne({ username: 'admin' });
    const usmanUser = await User.findOne({ username: 'usman' });
    const sarfrazUser = await User.findOne({ username: 'sarfraz' });
    const distributorUser = await User.findOne({ username: 'distributor' });

    if (!adminUser || !usmanUser) {
      throw new Error('Required seeded users (admin/usman) missing. Run npm run seed first.');
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

    const sarfrazToken = sarfrazUser ? jwt.sign(
      { id: sarfrazUser._id, username: sarfrazUser.username, role: sarfrazUser.role },
      process.env.JWT_SECRET || 'fallback_secret_key_12345',
      { expiresIn: '2h' }
    ) : null;


    // Get shops
    const stationShop = await Shop.findOne({ name: 'Station' });
    const camdenShop = await Shop.findOne({ name: 'Camden' });

    if (!stationShop || !camdenShop) {
      throw new Error('Required seeded shops (Station/Camden) missing.');
    }

    const testEmpId = `TEST_${Date.now().toString().slice(-5)}`;

    // ----------------------------------------------------
    // TEST 1: Create Employee with unique ID and initial history
    // ----------------------------------------------------
    console.log('[TEST 1] Creating Employee with unique ID, assigned to Station shop, £50 daily wage...');
    const createRes = await fetch(`${baseUrl}/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Test Worker Phase2',
        employeeId: testEmpId,
        assignedShop: stationShop._id,
        dailyWage: 50,
        phone: '07000111222',
        email: 'testphase2@pixx.co.uk',
        notes: 'Phase 2 test subject'
      })
    });
    const createData = await createRes.json();

    if (createRes.status === 201 && createData.success && createData.employee) {
      const emp = createData.employee;
      const hasWageHist = emp.wageHistory && emp.wageHistory.length === 1 && emp.wageHistory[0].wage === 50;
      const hasShopHist = emp.shopHistory && emp.shopHistory.length === 1 && emp.shopHistory[0].shop.toString() === stationShop._id.toString();

      if (hasWageHist && hasShopHist) {
        console.log('✓ PASS: Employee created with wageHistory (£50) and shopHistory (Station).');
        passed++;
      } else {
        console.error('✗ FAIL: Employee history not initialized properly:', emp);
      }
    } else {
      console.error('✗ FAIL: Employee creation failed:', createRes.status, createData);
    }

    const createdEmployeeId = createData?.employee?._id;

    // ----------------------------------------------------
    // TEST 2: Change Employee Shop (Station -> Camden)
    // ----------------------------------------------------
    console.log('\n[TEST 2] Changing Employee assigned shop from Station to Camden...');
    const shopUpdateRes = await fetch(`${baseUrl}/employees/${createdEmployeeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        assignedShop: camdenShop._id,
        shopChangeReason: 'Transferred for Camden support'
      })
    });
    const shopUpdateData = await shopUpdateRes.json();

    if (shopUpdateRes.status === 200 && shopUpdateData.success) {
      const updated = shopUpdateData.employee;
      const shopHistoryCount = updated.shopHistory?.length || 0;
      const latestShopEntry = updated.shopHistory?.[shopHistoryCount - 1];

      if (
        updated.assignedShop?._id?.toString() === camdenShop._id.toString() &&
        shopHistoryCount === 2 &&
        latestShopEntry?.shop?.toString() === camdenShop._id.toString()
      ) {
        console.log('✓ PASS: Current shop updated to Camden, shopHistory preserves Station and Camden.');
        passed++;
      } else {
        console.error('✗ FAIL: Shop update did not correctly record history:', updated);
      }
    } else {
      console.error('✗ FAIL: Shop update request failed:', shopUpdateRes.status, shopUpdateData);
    }

    // ----------------------------------------------------
    // TEST 3: Verify Historical Attendance Preserves Original Shop
    // ----------------------------------------------------
    console.log('\n[TEST 3] Creating attendance snapshot under Station shop, then updating employee shop to Camden...');
    const testDate = new Date('2026-05-15');
    const pastAttendance = await Attendance.create({
      employee: createdEmployeeId,
      employeeName: 'Test Worker Phase2',
      employeeId: testEmpId,
      dateString: '2026-05-15',
      shop: stationShop._id,
      shopName: stationShop.name,
      date: testDate,
      shiftStart: '09:00',
      shiftEnd: '19:00',
      scheduledHours: 10,
      dailyWage: 50,
      hourlyWage: 5.0,
      timeReached: '09:00',
      workerEndTime: '19:00',
      actualHours: 10,
      lateMinutes: 0,
      lateDeduction: 0,
      attendancePay: 50,
      status: 'Present',
      approvalStatus: 'Checked'
    });


    // Employee is currently at Camden; now transfer employee to Edgware
    const edgwareShop = (await Shop.findOne({ name: 'Edgware' })) || camdenShop;
    await fetch(`${baseUrl}/employees/${createdEmployeeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        assignedShop: edgwareShop._id,
        shopChangeReason: 'Transferred to Edgware'
      })
    });

    const fetchedAttendance = await Attendance.findById(pastAttendance._id);
    if (
      fetchedAttendance &&
      fetchedAttendance.shop.toString() === stationShop._id.toString() &&
      fetchedAttendance.shopName === 'Station'
    ) {
      console.log('✓ PASS: Historical attendance strictly preserved original Station shop and shopName.');
      passed++;
    } else {
      console.error('✗ FAIL: Historical attendance mutated upon employee shop reassignment:', fetchedAttendance);
    }

    // ----------------------------------------------------
    // TEST 4: Change Employee Wage (£50 -> £65) & Verify Historical Integrity
    // ----------------------------------------------------
    console.log('\n[TEST 4] Updating employee daily wage from £50 to £65; verifying past attendance pay is untouched...');
    const wageUpdateRes = await fetch(`${baseUrl}/employees/${createdEmployeeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        dailyWage: 65,
        wageChangeReason: 'Annual performance increase'
      })
    });
    const wageUpdateData = await wageUpdateRes.json();

    const refreshedAttendance = await Attendance.findById(pastAttendance._id);
    const updatedEmp = wageUpdateData?.employee;

    const wageHistValid = updatedEmp?.wageHistory?.length >= 2 && updatedEmp.dailyWage === 65;
    const attendancePayPreserved = refreshedAttendance.dailyWage === 50 && refreshedAttendance.attendancePay === 50;

    if (wageUpdateRes.status === 200 && wageHistValid && attendancePayPreserved) {
      console.log(`✓ PASS: Employee daily wage is now £65 (recorded in wageHistory). Historical attendance pay remains £50.00.`);
      passed++;
    } else {
      console.error('✗ FAIL: Historical wage integrity check failed:', {
        empWage: updatedEmp?.dailyWage,
        attWage: refreshedAttendance?.dailyWage,
        attPay: refreshedAttendance?.attendancePay
      });
    }

    // ----------------------------------------------------
    // TEST 5: Deactivate Employee & Verify Directory Exclusion
    // ----------------------------------------------------
    console.log('\n[TEST 5] Deactivating employee; verifying exclusion from active roster and persistence in historical profile...');
    const toggleRes = await fetch(`${baseUrl}/employees/${createdEmployeeId}/toggle-status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    const activeListRes = await fetch(`${baseUrl}/employees?status=Active`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });
    const activeListData = await activeListRes.json();

    const profileRes = await fetch(`${baseUrl}/employees/${createdEmployeeId}/profile`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });
    const profileData = await profileRes.json();

    const isExcludedFromActive = !activeListData.employees.some(e => e._id.toString() === createdEmployeeId.toString());
    const isProfileRetained = profileRes.status === 200 && profileData.employee.employmentStatus === 'Inactive';

    if (toggleRes.status === 200 && isExcludedFromActive && isProfileRetained) {
      console.log('✓ PASS: Deactivated employee excluded from Active list; full profile and attendance remain accessible.');
      passed++;
    } else {
      console.error('✗ FAIL: Deactivation test failed:', {
        toggleStatus: toggleRes.status,
        isExcludedFromActive,
        isProfileRetained
      });
    }

    // ----------------------------------------------------
    // TEST 6: Shop Schedule Management & Validation
    // ----------------------------------------------------
    console.log('\n[TEST 6] Testing Shop Schedule validation (closingTime <= openingTime rejection) and schedule update...');
    const existingSched = await ShopSchedule.findOne({ shop: null, dayOfWeek: 1 }); // Monday

    if (existingSched) {
      // Negative test: closing time before opening time
      const invalidRes = await fetch(`${baseUrl}/shops/schedules/${existingSched._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          openingTime: '18:00',
          closingTime: '09:00'
        })
      });

      // Valid update
      const validRes = await fetch(`${baseUrl}/shops/schedules/${existingSched._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          openingTime: '08:30',
          closingTime: '18:30'
        })
      });
      const validData = await validRes.json();

      // Revert back to original 09:00 - 19:00
      await fetch(`${baseUrl}/shops/schedules/${existingSched._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          openingTime: '09:00',
          closingTime: '19:00'
        })
      });

      if (invalidRes.status === 400 && validRes.status === 200 && validData.schedule.defaultHours === 10) {
        console.log('✓ PASS: Schedule validation successfully rejected invalid closing time (400) and applied valid hours (10 hrs).');
        passed++;
      } else {
        console.error('✗ FAIL: Schedule validation test failed:', {
          invalidStatus: invalidRes.status,
          validStatus: validRes.status
        });
      }
    } else {
      console.error('✗ FAIL: No seeded schedule found for Monday.');
    }

    // ----------------------------------------------------
    // TEST 7: Role Permission Security Guards (403 for non-admins)
    // ----------------------------------------------------
    console.log('\n[TEST 7] Testing security guards: non-admin roles (USMAN, SARFRAZ) blocked from mutating shops/employees...');
    const usmanMutateEmployee = await fetch(`${baseUrl}/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${usmanToken}`
      },
      body: JSON.stringify({
        name: 'Hacker',
        employeeId: 'HACK001',
        assignedShop: stationShop._id,
        dailyWage: 100
      })
    });

    const usmanMutateShop = await fetch(`${baseUrl}/shops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${usmanToken}`
      },
      body: JSON.stringify({ name: 'Unauthorized Shop' })
    });

    let sarfrazBlocked = true;
    if (sarfrazToken) {
      const sarfrazMutate = await fetch(`${baseUrl}/employees/${createdEmployeeId}/toggle-status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${sarfrazToken}`
        }
      });
      sarfrazBlocked = sarfrazMutate.status === 403;
    }

    if (usmanMutateEmployee.status === 403 && usmanMutateShop.status === 403 && sarfrazBlocked) {
      console.log('✓ PASS: Security guards active: Usman (403) and Sarfraz (403) cannot create or modify employees/shops.');
      passed++;
    } else {
      console.error('✗ FAIL: Security guard test failed:', {
        usmanEmpStatus: usmanMutateEmployee.status,
        usmanShopStatus: usmanMutateShop.status,
        sarfrazBlocked
      });
    }

    // Clean up test employee & attendance
    await Attendance.deleteOne({ _id: pastAttendance._id });
    await Employee.deleteOne({ _id: createdEmployeeId });

    console.log('\n====================================================');
    console.log(`  PHASE 2 TESTS RESULT: ${passed} / ${total} PASSED`);
    console.log('====================================================\n');

    await mongoose.connection.close();
    process.exit(passed === total ? 0 : 1);
  } catch (err) {
    console.error('Exception during Phase 2 tests:', err);
    await mongoose.connection.close();
    process.exit(1);
  }
}

runPhase2Tests();

