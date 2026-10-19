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

    // Test 2: Admin editing finalized salary
    salary.status = 'FINALIZED';
    salary.finalizationSnapshot = {
      finalSalary: 360,
      netAttendancePay: 350
    };
    salary.markModified = () => {};

    const LedgerTransaction = require('../models/LedgerTransaction');
    replaceMethod(LedgerTransaction, 'findOneAndUpdate', async () => ({}));
    replaceMethod(LedgerTransaction, 'find', async () => []);
    replaceMethod(SalaryAdjustment, 'create', async (data) => data);
    replaceMethod(SalaryAdjustment, 'find', async () => [
      { type: 'TRAVEL_ALLOWANCE', amount: 10 },
      { type: 'MANUAL_DEDUCTION', amount: 20 }
    ]);

    const ledgerHelper = require('../utils/ledgerHelper');
    replaceMethod(ledgerHelper, 'recalculateEmployeeLedger', async () => ({}));

    const response2 = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return this; }
    };

    await salaryController.updateSalaryDeduction({
      params: { id: salary._id },
      body: { weeklySalaryAmount: 400, deductionAmount: 20 },
      user: { _id: 'admin-1', name: 'Admin', role: 'ADMIN' }
    }, response2);

    assert.equal(response2.statusCode, 200);
    assert.equal(response2.data.success, true);
    assert.equal(salary.weeklySalaryOverride, 400);
    assert.equal(salary.netAttendancePay, 400);
    assert.equal(salary.manualDeductions, 20);
    // 400 attendance + 10 travel - 20 deduction = 390
    assert.equal(salary.finalSalary, 390);
    assert.equal(salary.status, 'FINALIZED');
    assert.equal(salary.finalizationSnapshot.finalSalary, 390);
    console.log('PASS Admin can edit finalized salary and correctly updates snapshot and ledger');

    // Test 3: Non-admin editing finalized salary is blocked
    const response3 = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return this; }
    };
    await salaryController.updateSalaryDeduction({
      params: { id: salary._id },
      body: { weeklySalaryAmount: 420, deductionAmount: 0 },
      user: { _id: 'user-2', name: 'Distributor', role: 'SALARY_DISTRIBUTOR' }
    }, response3);
    assert.equal(response3.statusCode, 403);
    console.log('PASS Non-admin cannot edit finalized salary');

    // Test 4: Admin unfinalize salary when totalPaid === 0
    const Attendance = require('../models/Attendance');
    replaceMethod(Attendance, 'updateMany', async () => ({ modifiedCount: 1 }));
    replaceMethod(LedgerTransaction, 'deleteMany', async () => ({ deletedCount: 1 }));

    const response4 = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return this; }
    };
    await salaryController.unfinalizeWeeklySalary({
      params: { id: salary._id },
      user: { _id: 'admin-1', name: 'Admin', role: 'ADMIN' }
    }, response4);
    assert.equal(response4.statusCode, 200);
    assert.equal(response4.data.success, true);
    assert.equal(salary.status, 'Generated');
    assert.equal(salary.finalizationSnapshot, null);
    console.log('PASS Admin can unfinalize salary with zero payments');

  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
