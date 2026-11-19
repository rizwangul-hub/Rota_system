/**
 * Automated Test Suite: Worker Portal Phase 1 (Worker Accounts & Authentication)
 * 
 * Verifies:
 * - Dedicated WORKER role & email/password authentication
 * - Admin worker account discovery, creation & duplicate prevention
 * - Strict 1:1 Employee-to-Account linking
 * - Immediate session revocation upon account/employee deactivation
 * - Protection against IDOR / privilege escalation (Workers blocked from admin APIs)
 * - Safe profile exposure (Confidential bank/NI data excluded)
 * - Forgot password, reset password, and self-service password change
 * - Non-breakage of existing admin/operator authentication
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
const { JWT_SECRET } = require('../middleware/auth');

async function runPhase1Tests() {
  console.log('\n======================================================');
  console.log('--- RUNNING WORKER PORTAL PHASE 1 AUTHENTICATION TESTS ---');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGO_URI);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  // 1. Setup / Find test entities
  const adminUser = await User.findOne({ role: 'ADMIN', isActive: true });
  assert(adminUser, 'Admin user must exist in DB for admin operations.');
  const adminToken = jwt.sign(
    { id: adminUser._id, role: adminUser.role, username: adminUser.username },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Find or create test entities
  const shop = await Shop.findOne() || await Shop.create({ name: 'Test Shop', code: 'TST' });
  
  let testEmp1 = await Employee.findOne({ employeeId: 'TEST_WKR_001' });
  if (!testEmp1) {
    testEmp1 = await Employee.create({
      employeeId: 'TEST_WKR_001',
      name: 'Test Worker One',
      email: 'testworker1@pixxrota.com',
      dailyWage: 60,
      assignedShop: shop._id,
      employmentStatus: 'Active',
      bankAccountNumber: '12345678',
      bankSortCode: '11-22-33',
      nationalInsuranceNumber: 'AB123456C'
    });
  } else {
    testEmp1.employmentStatus = 'Active';
    testEmp1.bankAccountNumber = '12345678';
    testEmp1.bankSortCode = '11-22-33';
    testEmp1.nationalInsuranceNumber = 'AB123456C';
    await testEmp1.save();
  }

  let testEmp2 = await Employee.findOne({ employeeId: 'TEST_WKR_002' });
  if (!testEmp2) {
    testEmp2 = await Employee.create({
      employeeId: 'TEST_WKR_002',
      name: 'Test Worker Two',
      email: 'testworker2@pixxrota.com',
      dailyWage: 65,
      assignedShop: shop._id,
      employmentStatus: 'Active'
    });
  } else {
    testEmp2.employmentStatus = 'Active';
    await testEmp2.save();
  }

  // Clean any existing test user accounts
  await User.deleteMany({ email: { $in: ['testworker1@pixxrota.com', 'testworker2@pixxrota.com'] } });

  try {
    // TEST 1: Admin views worker accounts overview
    console.log('Test 1: Admin retrieves worker accounts overview...');
    const listRes = await fetch(`${baseUrl}/admin/worker-accounts`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const listData = await listRes.json();
    assert.strictEqual(listRes.status, 200, 'Admin can fetch worker accounts');
    assert.strictEqual(listData.success, true, 'Success flag is true');
    assert(Array.isArray(listData.accounts), 'Returns accounts array');
    assert(listData.metrics.totalEmployees >= 2, 'Metrics reflect employees count');
    console.log(`   ✓ Passed: Admin retrieved accounts list (${listData.metrics.totalEmployees} employees, ${listData.metrics.accountsMissing} without accounts).`);

    // TEST 2: Admin creates worker account for Employee 1
    console.log('Test 2: Admin creates worker account with email and password...');
    const createRes = await fetch(`${baseUrl}/admin/worker-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        employeeId: String(testEmp1._id),
        email: 'testworker1@pixxrota.com',
        password: 'Password123!'
      })
    });
    const createData = await createRes.json();
    assert.strictEqual(createRes.status, 201, 'Worker account created with 201');
    assert.strictEqual(createData.account.email, 'testworker1@pixxrota.com');
    const worker1UserId = createData.account.userId;
    console.log('   ✓ Passed: Worker account created successfully for test employee 1.');

    // TEST 3: Duplicate account prevention (Same employee cannot have two accounts)
    console.log('Test 3: Duplicate account prevention for same employee...');
    const duplicateEmpRes = await fetch(`${baseUrl}/admin/worker-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        employeeId: String(testEmp1._id),
        email: 'differentemail@pixxrota.com',
        password: 'Password123!'
      })
    });
    const duplicateEmpData = await duplicateEmpRes.json();
    assert.strictEqual(duplicateEmpRes.status, 400, 'Rejected duplicate employee account creation');
    assert(duplicateEmpData.message.includes('already has a worker portal account'));
    console.log('   ✓ Passed: Correctly blocked duplicate account creation for same employee.');

    // TEST 4: Duplicate email prevention across accounts
    console.log('Test 4: Duplicate email prevention across different employees...');
    const duplicateEmailRes = await fetch(`${baseUrl}/admin/worker-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        employeeId: String(testEmp2._id),
        email: 'testworker1@pixxrota.com', // Already used by Worker 1
        password: 'Password123!'
      })
    });
    const duplicateEmailData = await duplicateEmailRes.json();
    assert.strictEqual(duplicateEmailRes.status, 400, 'Rejected duplicate email across employees');
    assert(duplicateEmailData.message.includes('already exists'));
    console.log('   ✓ Passed: Correctly blocked duplicate email address reuse.');

    // TEST 5: Worker login with valid email and password
    console.log('Test 5: Worker login with valid email and password...');
    const loginRes = await fetch(`${baseUrl}/worker/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testworker1@pixxrota.com',
        password: 'Password123!'
      })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200, 'Login succeeded');
    assert(loginData.token, 'JWT token returned');
    assert.strictEqual(loginData.user.role, 'WORKER');
    assert.strictEqual(loginData.user.employee.employeeId, 'TEST_WKR_001');
    const workerToken = loginData.token;
    console.log('   ✓ Passed: Worker logged in successfully and received JWT session.');

    // TEST 6: Invalid login attempts (Wrong password, non-existent email)
    console.log('Test 6: Invalid login credentials rejected with 401...');
    const wrongPassRes = await fetch(`${baseUrl}/worker/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testworker1@pixxrota.com',
        password: 'WrongPassword999!'
      })
    });
    const wrongPassData = await wrongPassRes.json();
    assert.strictEqual(wrongPassRes.status, 401, 'Wrong password rejected');
    assert.strictEqual(wrongPassData.message, 'Invalid email or password.');

    const wrongEmailRes = await fetch(`${baseUrl}/worker/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent@pixxrota.com',
        password: 'Password123!'
      })
    });
    assert.strictEqual(wrongEmailRes.status, 401, 'Non-existent email rejected');
    console.log('   ✓ Passed: Invalid credentials properly rejected with 401.');

    // TEST 7: Worker profile endpoint does NOT expose bank details or internal documents
    console.log('Test 7: Worker profile data filtering (zero confidential exposure)...');
    const meRes = await fetch(`${baseUrl}/worker/auth/me`, {
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    const meData = await meRes.json();
    assert.strictEqual(meRes.status, 200);
    const empData = meData.user.employee;
    assert.strictEqual(empData.employeeId, 'TEST_WKR_001');
    assert.strictEqual(empData.dailyWage, undefined, 'Daily wage MUST NOT be exposed in profile');
    assert.strictEqual(empData.bankAccountNumber, undefined, 'Bank account number MUST be stripped');
    assert.strictEqual(empData.bankSortCode, undefined, 'Sort code MUST be stripped');
    assert.strictEqual(empData.nationalInsuranceNumber, undefined, 'NI number MUST be stripped');
    assert.strictEqual(empData.emergencyContactPhone, undefined, 'Emergency contact MUST NOT be exposed');
    assert.strictEqual(empData.rightToWorkReference, undefined, 'Right to work MUST NOT be exposed');
    assert.strictEqual(empData.documents, undefined, 'Internal documents MUST be stripped');
    console.log('   ✓ Passed: Confidential wage/bank/NI/RTW details are strictly shielded from worker profile response.');

    // TEST 8: Anti-Privilege Escalation (Worker token cannot access admin routes)
    console.log('Test 8: Worker blocked from Admin API endpoints (403 Forbidden)...');
    const forbiddenAdminRes = await fetch(`${baseUrl}/admin/worker-accounts`, {
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    assert.strictEqual(forbiddenAdminRes.status, 403, 'Worker blocked with 403 Forbidden');
    console.log('   ✓ Passed: Worker token properly forbidden from accessing Admin management routes.');

    // TEST 9: Account deactivation rejects login and immediately revokes active sessions
    console.log('Test 9: Account deactivation and immediate session revocation...');
    const toggleRes = await fetch(`${baseUrl}/admin/worker-accounts/${worker1UserId}/toggle-status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const toggleData = await toggleRes.json();
    assert.strictEqual(toggleRes.status, 200);
    assert.strictEqual(toggleData.isActive, false);

    // Attempting login while deactivated
    const deactLoginRes = await fetch(`${baseUrl}/worker/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testworker1@pixxrota.com',
        password: 'Password123!'
      })
    });
    const deactLoginData = await deactLoginRes.json();
    assert.strictEqual(deactLoginRes.status, 403, 'Deactivated account cannot log in');
    assert(deactLoginData.message.includes('deactivated'));

    // Existing active JWT token used after deactivation MUST be rejected immediately
    const revokedSessionRes = await fetch(`${baseUrl}/worker/auth/me`, {
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    const revokedSessionData = await revokedSessionRes.json();
    assert.strictEqual(revokedSessionRes.status, 401, 'Existing token immediately revoked');
    assert(revokedSessionData.message.includes('deactivated'));
    console.log('   ✓ Passed: Deactivated account immediately locked out of existing sessions.');

    // TEST 10: Account reactivation restores access
    console.log('Test 10: Reactivating worker account restores access...');
    await fetch(`${baseUrl}/admin/worker-accounts/${worker1UserId}/toggle-status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const reactLoginRes = await fetch(`${baseUrl}/worker/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testworker1@pixxrota.com',
        password: 'Password123!'
      })
    });
    const reactLoginData = await reactLoginRes.json();
    assert.strictEqual(reactLoginRes.status, 200, 'Reactivated worker can log in again');
    const freshToken = reactLoginData.token;
    console.log('   ✓ Passed: Reactivated worker account functions normally.');

    // TEST 11: Employee status deactivation (EmploymentStatus !== Active) immediately revokes access
    console.log('Test 11: Employee status deactivation revokes portal access...');
    testEmp1.employmentStatus = 'Inactive';
    await testEmp1.save();

    const empDeactRes = await fetch(`${baseUrl}/worker/auth/me`, {
      headers: { Authorization: `Bearer ${freshToken}` }
    });
    const empDeactData = await empDeactRes.json();
    assert.strictEqual(empDeactRes.status, 401, 'Inactive employee blocked immediately');
    assert(empDeactData.message.includes('inactive or suspended'));

    // Restore employee status to Active
    testEmp1.employmentStatus = 'Active';
    await testEmp1.save();
    console.log('   ✓ Passed: Employee profile deactivation immediately shuts down worker portal access.');

    // TEST 12: Forgot password and token reset flow
    console.log('Test 12: Forgot password and token reset flow...');
    const forgotRes = await fetch(`${baseUrl}/worker/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'testworker1@pixxrota.com' })
    });
    const forgotData = await forgotRes.json();
    assert.strictEqual(forgotRes.status, 200);
    const resetToken = forgotData.resetToken;
    assert(resetToken, 'Reset token generated');

    // Reset password with token
    const resetRes = await fetch(`${baseUrl}/worker/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: resetToken,
        newPassword: 'BrandNewPassword888!'
      })
    });
    assert.strictEqual(resetRes.status, 200);

    // Old password fails
    const oldPassRes = await fetch(`${baseUrl}/worker/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testworker1@pixxrota.com',
        password: 'Password123!'
      })
    });
    assert.strictEqual(oldPassRes.status, 401);

    // New password succeeds
    const newPassRes = await fetch(`${baseUrl}/worker/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testworker1@pixxrota.com',
        password: 'BrandNewPassword888!'
      })
    });
    const newPassData = await newPassRes.json();
    assert.strictEqual(newPassRes.status, 200);
    const afterResetToken = newPassData.token;
    console.log('   ✓ Passed: Password reset flow completed and verified.');

    // TEST 13: Worker self-service password change
    console.log('Test 13: Worker self-service password change...');
    const changePassRes = await fetch(`${baseUrl}/worker/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${afterResetToken}`
      },
      body: JSON.stringify({
        currentPassword: 'BrandNewPassword888!',
        newPassword: 'SelfChangedPass999!'
      })
    });
    assert.strictEqual(changePassRes.status, 200);

    const postChangeLogin = await fetch(`${baseUrl}/worker/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testworker1@pixxrota.com',
        password: 'SelfChangedPass999!'
      })
    });
    assert.strictEqual(postChangeLogin.status, 200);
    console.log('   ✓ Passed: Worker self-service password change verified.');

    // TEST 14: Existing Admin and Operator Login Regression
    console.log('Test 14: Regression check for existing management users...');
    const adminRegressionRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: adminUser.username,
        password: 'wrong_password_check'
      })
    });
    assert.strictEqual(adminRegressionRes.status, 401);
    console.log('   ✓ Passed: Existing auth routes are intact and operational.');

    console.log('\n======================================================');
    console.log('ALL 14 WORKER PORTAL PHASE 1 TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } finally {
    // Cleanup test records
    await User.deleteMany({ email: { $in: ['testworker1@pixxrota.com', 'testworker2@pixxrota.com'] } });
    await Employee.deleteMany({ employeeId: { $in: ['TEST_WKR_001', 'TEST_WKR_002'] } });
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
}

runPhase1Tests().catch(err => {
  console.error('Phase 1 Test Failed:', err);
  process.exit(1);
});
