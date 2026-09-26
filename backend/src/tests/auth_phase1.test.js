const assert = require('assert');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../../.env') });
if (!process.env.SEED_USER_PASSWORD) {
  throw new Error('Set SEED_USER_PASSWORD for the isolated Phase 1 integration test database.');
}

const connectDB = require('../config/db');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');
const app = require('../index');

// Start express server locally on ephemeral port for automated HTTP testing
const http = require('http');

async function runPhase1Tests() {
  console.log('\n==================================================');
  console.log('PHASE 1 — AUTHENTICATION & ROLE AUTHORIZATION TESTS');
  console.log('==================================================\n');

  await connectDB();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    // 1. Admin login
    console.log('1. Testing Admin login...');
    const adminRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: process.env.SEED_USER_PASSWORD })
    });
    const adminData = await adminRes.json();
    assert.strictEqual(adminRes.status, 200);
    assert.strictEqual(adminData.success, true);
    assert.strictEqual(adminData.user.role, 'ADMIN');
    assert.ok(adminData.token);
    const adminToken = adminData.token;
    console.log('   ✓ Admin login successful. Role: ADMIN');

    // 2. Sarfraz login
    console.log('2. Testing Sarfraz Khan (Attendance Checker) login...');
    const sarfrazRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sarfraz', password: process.env.SEED_USER_PASSWORD })
    });
    const sarfrazData = await sarfrazRes.json();
    assert.strictEqual(sarfrazRes.status, 200);
    assert.strictEqual(sarfrazData.success, true);
    assert.strictEqual(sarfrazData.user.role, 'ATTENDANCE_CHECKER');
    assert.ok(sarfrazData.token);
    const sarfrazToken = sarfrazData.token;
    console.log('   ✓ Sarfraz login successful. Role: ATTENDANCE_CHECKER');

    // 3. Salary Distributor login
    console.log('3. Testing Salary Distributor login...');
    const distRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'distributor', password: process.env.SEED_USER_PASSWORD })
    });
    const distData = await distRes.json();
    assert.strictEqual(distRes.status, 200);
    assert.strictEqual(distData.success, true);
    assert.strictEqual(distData.user.role, 'SALARY_DISTRIBUTOR');
    assert.ok(distData.token);
    const distToken = distData.token;
    console.log('   ✓ Salary Distributor login successful. Role: SALARY_DISTRIBUTOR');

    // 4. Usman login
    console.log('4. Testing Usman Salahuddin (Attendance Operator) login...');
    const usmanRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'usman', password: process.env.SEED_USER_PASSWORD })
    });
    const usmanData = await usmanRes.json();
    assert.strictEqual(usmanRes.status, 200);
    assert.strictEqual(usmanData.success, true);
    assert.strictEqual(usmanData.user.role, 'ATTENDANCE_OPERATOR');
    assert.ok(usmanData.token);
    const usmanToken = usmanData.token;
    console.log('   ✓ Usman login successful. Role: ATTENDANCE_OPERATOR');

    // 5. Invalid login
    console.log('5. Testing Invalid login handling...');
    const invalidRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
    });
    const invalidData = await invalidRes.json();
    assert.strictEqual(invalidRes.status, 401);
    assert.strictEqual(invalidData.success, false);
    console.log('   ✓ Correctly rejected invalid credentials with 401');

    // 6. Unauthorized API request (No token provided)
    console.log('6. Testing Unauthorized API request without token...');
    const noTokenRes = await fetch(`${baseUrl}/auth/me`);
    const noTokenData = await noTokenRes.json();
    assert.strictEqual(noTokenRes.status, 401);
    assert.strictEqual(noTokenData.success, false);
    console.log('   ✓ Correctly blocked unauthenticated request with 401');

    // 7. Role restrictions & permissions
    console.log('7. Testing Role-based permissions enforcement...');

    // 7a. Usman attempting to generate weekly salaries (ADMIN only)
    const usmanBlockRes = await fetch(`${baseUrl}/salaries/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${usmanToken}`
      },
      body: JSON.stringify({ date: new Date() })
    });
    assert.strictEqual(usmanBlockRes.status, 403, 'Usman must be forbidden from generating weekly salaries');
    console.log('   ✓ Usman blocked from Admin endpoint /salaries/generate (403 Forbidden)');

    // 7b. Salary Distributor attempting to submit attendance batch (OPERATOR/ADMIN only)
    const distBlockRes = await fetch(`${baseUrl}/attendance/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${distToken}`
      },
      body: JSON.stringify({ date: new Date(), shopId: 'dummy', records: [] })
    });
    assert.strictEqual(distBlockRes.status, 403, 'Salary Distributor must be forbidden from editing attendance');
    console.log('   ✓ Distributor blocked from Attendance entry /attendance/batch (403 Forbidden)');

    // 7c. Sarfraz attempting to create a new user (ADMIN only)
    const sarfrazBlockRes = await fetch(`${baseUrl}/auth/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sarfrazToken}`
      },
      body: JSON.stringify({ name: 'Test', username: 'test', password: '123', role: 'ADMIN' })
    });
    assert.strictEqual(sarfrazBlockRes.status, 403, 'Sarfraz must be forbidden from creating users');
    console.log('   ✓ Sarfraz blocked from Admin user management (403 Forbidden)');

    // 7d. Admin accessing Admin-only endpoint
    const adminAllowedRes = await fetch(`${baseUrl}/auth/users`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(adminAllowedRes.status, 200, 'Admin must be authorized for Admin endpoints');
    console.log('   ✓ Admin authorized for full access (200 OK)');

    // 8 & 9. Token persistence & validation (/auth/me)
    console.log('8 & 9. Testing Token validation and session profile retrieval...');
    const profileRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { 'Authorization': `Bearer ${sarfrazToken}` }
    });
    const profileData = await profileRes.json();
    assert.strictEqual(profileRes.status, 200);
    assert.strictEqual(profileData.user.username, 'sarfraz');
    assert.strictEqual(profileData.user.role, 'ATTENDANCE_CHECKER');
    console.log('   ✓ Token verified and session restored successfully');

    // 10. Expired token handling
    console.log('10. Testing Expired token rejection...');
    const expiredToken = jwt.sign(
      { id: sarfrazData.user.id, role: sarfrazData.user.role, username: sarfrazData.user.username },
      JWT_SECRET,
      { expiresIn: '-1s' } // Expired 1 second ago
    );
    const expiredRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });
    const expiredData = await expiredRes.json();
    assert.strictEqual(expiredRes.status, 401);
    assert.strictEqual(expiredData.code, 'TOKEN_EXPIRED');
    console.log('   ✓ Expired token rejected with 401 and code TOKEN_EXPIRED');

    console.log('\n==================================================');
    console.log(' ALL 10 PHASE 1 AUTHENTICATION & ROLE TESTS PASSED!');
    console.log('==================================================\n');

  } finally {
    server.close();
    process.exit(0);
  }
}

runPhase1Tests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
