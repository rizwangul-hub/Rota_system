const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase10-test-secret-with-at-least-32-characters';

const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const {
  calculateAttendanceRecord,
  getWeekRange,
  calculateWeeklySalaryComponents
} = require('../utils/calc');
const { validatePaymentAmount, calculatePaymentState } = require('../utils/payment');
const { isAllowedOrigin, normalizeAllowedOrigins } = require('../utils/cors');
const { logServerError } = require('../utils/httpErrors');

let passed = 0;

function test(name, run) {
  run();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function testAsync(name, run) {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

async function run() {
  const originalFindById = User.findById;
  const user = { _id: 'test-user', isActive: true, role: 'ADMIN' };

  try {
    User.findById = () => ({ select: async () => user });

    await testAsync('missing token returns 401', async () => {
      const res = responseRecorder();
      await authenticate({ headers: {} }, res, () => assert.fail('must not call next'));
      assert.equal(res.statusCode, 401);
    });

    await testAsync('wrong token format returns 401', async () => {
      const res = responseRecorder();
      await authenticate({ headers: { authorization: 'Basic abc' } }, res, () => assert.fail('must not call next'));
      assert.equal(res.statusCode, 401);
    });

    await testAsync('malformed JWT returns 401 without exposing token details', async () => {
      const res = responseRecorder();
      await authenticate({ headers: { authorization: 'Bearer not-a-jwt' } }, res, () => assert.fail('must not call next'));
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.code, 'INVALID_TOKEN');
      assert.equal(Object.hasOwn(res.body, 'error'), false);
    });

    await testAsync('expired JWT returns 401', async () => {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: -1 });
      const res = responseRecorder();
      await authenticate({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail('must not call next'));
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.code, 'TOKEN_EXPIRED');
    });

    await testAsync('valid JWT loads an active user', async () => {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1m' });
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = responseRecorder();
      let nextCalled = false;
      await authenticate(req, res, () => { nextCalled = true; });
      assert.equal(nextCalled, true);
      assert.equal(req.user, user);
    });

    await testAsync('missing database user returns 401', async () => {
      User.findById = () => ({ select: async () => null });
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1m' });
      const res = responseRecorder();
      await authenticate({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail('must not call next'));
      assert.equal(res.statusCode, 401);
    });

    User.findById = originalFindById;

    test('unauthorized role returns 403', () => {
      const res = responseRecorder();
      authorize('ADMIN')({ user: { role: 'SALARY_DISTRIBUTOR' } }, res, () => assert.fail('must not call next'));
      assert.equal(res.statusCode, 403);
    });

    test('authorized role proceeds', () => {
      const res = responseRecorder();
      let nextCalled = false;
      authorize('ADMIN')({ user: { role: 'ADMIN' } }, res, () => { nextCalled = true; });
      assert.equal(nextCalled, true);
    });

    test('CORS allows configured origins and rejects unconfigured production origins', () => {
      const origins = normalizeAllowedOrigins({
        ADMIN_WEB_URL: 'https://admin.example.test/',
        CORS_ORIGINS: 'https://reports.example.test, https://admin.example.test'
      });
      assert.equal(origins.length, 2);
      assert.equal(isAllowedOrigin('https://admin.example.test', origins, true), true);
      assert.equal(isAllowedOrigin('https://attacker.example.test', origins, true), false);
      assert.equal(isAllowedOrigin(undefined, origins, true), true);
    });

    test('CORS permits local development origins only outside production', () => {
      assert.equal(isAllowedOrigin('http://localhost:5173', [], false), true);
      assert.equal(isAllowedOrigin('http://localhost:5173', [], true), false);
    });

    test('invalid configured CORS origin fails configuration', () => {
      assert.throws(
        () => normalizeAllowedOrigins({ ADMIN_WEB_URL: 'not-a-url' }),
        /valid absolute URLs/
      );
    });

    test('production error logging excludes exception messages and stack traces', () => {
      const originalEnvironment = process.env.NODE_ENV;
      const originalConsoleError = console.error;
      let logged = '';
      process.env.NODE_ENV = 'production';
      console.error = (...values) => { logged = values.map(String).join(' '); };
      try {
        const error = new Error('mongodb://private-user:private-password@host/db');
        logServerError('request failed', error);
      } finally {
        console.error = originalConsoleError;
        if (originalEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalEnvironment;
      }
      assert.equal(logged.includes('private-password'), false);
      assert.equal(logged.includes('mongodb://'), false);
      assert.equal(logged.includes('stack'), false);
    });

    test('non-numeric, infinite, negative, and zero payment values are rejected', () => {
      for (const amount of ['NaN', Infinity, -1, 0]) {
        assert.equal(validatePaymentAmount(amount, 100).valid, false);
      }
    });

    test('a sub-penny payment is rejected after currency rounding', () => {
      assert.equal(validatePaymentAmount(0.001, 100).valid, false);
    });

    test('payment cannot exceed outstanding salary', () => {
      assert.equal(validatePaymentAmount(100.01, 100).valid, false);
    });

    test('£300, £300, £400 installments clear a £1,000 salary exactly once', () => {
      let paid = 0;
      let finalState;
      for (const installment of [300, 300, 400]) {
        const result = validatePaymentAmount(installment, 1000 - paid);
        assert.equal(result.valid, true);
        finalState = calculatePaymentState(1000, paid, result.amount);
        paid = finalState.totalPaid;
      }
      assert.equal(paid, 1000);
      assert.equal(finalState.balanceRemaining, 0);
      assert.equal(finalState.status, 'PAID');
    });

    test('payment state rejects negative salary values', () => {
      assert.throws(() => calculatePaymentState(-1, 0, 1), RangeError);
    });

    test('15 minutes late has no deduction and 30 minutes late deducts the full lateness', () => {
      const withinGrace = calculateAttendanceRecord({
        dailyWage: 50, shiftStart: '09:00', shiftEnd: '19:00',
        timeReached: '09:15', workerEndTime: '19:00', status: 'Present'
      });
      const outsideGrace = calculateAttendanceRecord({
        dailyWage: 50, shiftStart: '09:00', shiftEnd: '19:00',
        timeReached: '09:30', workerEndTime: '19:00', status: 'Present'
      });
      assert.equal(withinGrace.lateDeduction, 0);
      assert.equal(outsideGrace.lateMinutes, 30);
      assert.equal(outsideGrace.lateDeduction, 2.5);
      assert.equal(outsideGrace.attendancePay, 47.5);
    });

    test('weekly salary uses Monday through Sunday across year boundary', () => {
      const week = getWeekRange('2026-01-01');
      assert.equal(week.startDateString, '2025-12-29');
      assert.equal(week.endDateString, '2026-01-04');
    });

    test('a monthly bonus is counted once in an explicitly calculated weekly salary', () => {
      const result = calculateWeeklySalaryComponents({ netAttendancePay: 100, bonus: 200 });
      assert.equal(result.finalSalary, 300);
    });
  } finally {
    User.findById = originalFindById;
  }

  console.log(`\nPhase 10 non-database checks: ${passed}/${passed} passed.`);
}

run().catch(error => {
  console.error('Phase 10 checks failed:', error);
  process.exitCode = 1;
});
