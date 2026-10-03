const assert = require('node:assert/strict');

const Attendance = require('../models/Attendance');
const Bonus = require('../models/Bonus');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const WeeklySalary = require('../models/WeeklySalary');
const reportController = require('../controllers/reportController');

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
  const restores = [];
  const replaceMethod = (target, key, replacement) => {
    const original = target[key];
    target[key] = replacement;
    restores.push(() => { target[key] = original; });
  };

  try {
    let capturedSalaryQuery;
    let capturedBonusQuery;
    replaceMethod(Employee, 'countDocuments', async () => 2);
    replaceMethod(WeeklySalary, 'find', async query => {
      if (!Object.hasOwn(query, 'weekEndDate')) capturedSalaryQuery = query;
      return [];
    });
    replaceMethod(Bonus, 'find', async query => {
      capturedBonusQuery = query;
      return [];
    });
    replaceMethod(Shop, 'find', async () => []);
    replaceMethod(Attendance, 'find', async () => []);

    const allShopsResponse = responseRecorder();
    await reportController.getCompanyPayrollSummary({
      user: { role: 'ADMIN' },
      query: {}
    }, allShopsResponse);
    assert.equal(allShopsResponse.statusCode, 200);
    assert.equal(allShopsResponse.body.success, true);
    assert.equal(Object.hasOwn(capturedSalaryQuery, 'shop'), false);
    assert.equal(Object.hasOwn(capturedBonusQuery, 'shop'), false);

    const shopId = '64d000000000000000000002';
    const filteredResponse = responseRecorder();
    await reportController.getCompanyPayrollSummary({
      user: { role: 'ADMIN' },
      query: { shopId }
    }, filteredResponse);
    assert.equal(filteredResponse.statusCode, 200);
    assert.equal(filteredResponse.body.success, true);
    assert.equal(String(capturedSalaryQuery.shop), shopId);
    assert.equal(String(capturedBonusQuery.shop), shopId);

    console.log('PASS company payroll summary works with and without a shop filter');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
