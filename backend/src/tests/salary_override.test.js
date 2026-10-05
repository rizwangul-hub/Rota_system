const assert = require('node:assert/strict');
const audit = require('../utils/audit');

audit.logAction = async () => {};

const WeeklySalary = require('../models/WeeklySalary');
const SalaryAdjustment = require('../models/SalaryAdjustment');
const SalaryPayment = require('../models/SalaryPayment');
const Bonus = require('../models/Bonus');
const salaryController = require('../controllers/salaryController');

async function run() {
  const restores = [];
  const replaceMethod = (target, key, replacement) => {
    const original = target[key];
    target[key] = replacement;
    restores.push(() => { target[key] = original; });
  };

  try {
    const salary = {
      _id: 'salary-1',
      employee: 'worker-1',
      employeeName: 'Test Worker',
      weekLabel: '27/09/2026 – 03/10/2026',
      status: 'Generated',
      netAttendancePay: 300,
      weeklySalaryOverride: null,
      travelAllowance: 10,
      otherAllowances: 0,
      bonus: 0,
      manualDeductions: 0,
      totalPaid: 0,
      async save() {}
    };
    replaceMethod(WeeklySalary, 'findById', async () => salary);
    replaceMethod(SalaryAdjustment, 'findOne', async () => null);
    replaceMethod(SalaryAdjustment, 'find', async () => [
      { type: 'TRAVEL_ALLOWANCE', amount: 10 }
    ]);
    replaceMethod(SalaryAdjustment, 'deleteMany', async () => ({ deletedCount: 0 }));
    replaceMethod(Bonus, 'find', async () => []);
    replaceMethod(SalaryPayment, 'find', async () => []);

    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.data = data;
        return this;
      }
    };
    await salaryController.updateSalaryDeduction({
      params: { id: salary._id },
      body: { weeklySalaryAmount: 350, deductionAmount: 0 },
      user: { _id: 'admin-1', name: 'Admin', role: 'ADMIN' }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.data.success, true);
    assert.equal(salary.weeklySalaryOverride, 350);
    assert.equal(salary.netAttendancePay, 350);
    assert.equal(salary.manualDeductions, 0);
    assert.equal(salary.finalSalary, 360);
    assert.equal(salary.balanceRemaining, 360);
    console.log('PASS weekly salary override persists and recalculates salary with zero deduction');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
