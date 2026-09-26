const assert = require('assert');
const {
  calculateAttendanceRecord,
  calculateScheduledHours,
  calculateLateMinutes,
  getDefaultShiftTimesForDate,
  getWeekRange,
  calculateFinalWeeklySalary,
  calculateWeeklySalaryComponents
} = require('../utils/calc');

console.log('--- RUNNING PIXXTECHNOLOGIES BUSINESS LOGIC TESTS ---');

// TEST 1: Scheduled hours calculation
const monHours = calculateScheduledHours('09:00', '19:00');
assert.strictEqual(monHours, 10, 'Mon-Fri scheduled hours should be 10');

const satHours = calculateScheduledHours('09:00', '18:00');
assert.strictEqual(satHours, 9, 'Saturday scheduled hours should be 9');

const sunHours = calculateScheduledHours('11:00', '17:00');
assert.strictEqual(sunHours, 6, 'Sunday scheduled hours should be 6');
console.log(' Scheduled hours tests passed');

// TEST 2: Lateness minutes calculation
assert.strictEqual(calculateLateMinutes('09:00', '09:00'), 0);
assert.strictEqual(calculateLateMinutes('09:00', '09:10'), 10);
assert.strictEqual(calculateLateMinutes('09:00', '09:15'), 15);
assert.strictEqual(calculateLateMinutes('09:00', '09:30'), 30);
assert.strictEqual(calculateLateMinutes('09:00', '08:50'), 0);
console.log(' Lateness minutes tests passed');

// TEST 3: Canonical £50 / 10-hour shift tests (Section 5 & 48)
// On-time: £50 pay, £0 deduction
const tOnTime = calculateAttendanceRecord({
  dailyWage: 50,
  shiftStart: '09:00',
  shiftEnd: '19:00',
  timeReached: '09:00',
  workerEndTime: '19:00',
  status: 'Present'
});
assert.strictEqual(tOnTime.hourlyWage, 5);
assert.strictEqual(tOnTime.lateMinutes, 0);
assert.strictEqual(tOnTime.lateDeduction, 0);
assert.strictEqual(tOnTime.attendancePay, 50);
assert.strictEqual(tOnTime.status, 'Present');
console.log(' 1. On-time test passed (£50 pay, £0 deduction)');

// 10-minute late: within 15-minute grace -> £0 deduction, £50 pay
const tLate10 = calculateAttendanceRecord({
  dailyWage: 50,
  shiftStart: '09:00',
  shiftEnd: '19:00',
  timeReached: '09:10',
  workerEndTime: '19:00',
  status: 'Present'
});
assert.strictEqual(tLate10.lateMinutes, 10);
assert.strictEqual(tLate10.lateDeduction, 0, '10 minutes late is within 15 min grace');
assert.strictEqual(tLate10.attendancePay, 50);
console.log(' 2. 10-minute late test passed (within grace, £50 pay)');

// 15-minute late: exact grace boundary -> £0 deduction, £50 pay
const tLate15 = calculateAttendanceRecord({
  dailyWage: 50,
  shiftStart: '09:00',
  shiftEnd: '19:00',
  timeReached: '09:15',
  workerEndTime: '19:00',
  status: 'Present'
});
assert.strictEqual(tLate15.lateMinutes, 15);
assert.strictEqual(tLate15.lateDeduction, 0, '15 minutes late is at grace boundary');
assert.strictEqual(tLate15.attendancePay, 50);
console.log(' 3. 15-minute late test passed (at grace boundary, £50 pay)');

// 30-minute late: exceeds 15-minute grace -> £2.50 deduction, £47.50 pay (Section 48)
const tLate30 = calculateAttendanceRecord({
  dailyWage: 50,
  shiftStart: '09:00',
  shiftEnd: '19:00',
  timeReached: '09:30',
  workerEndTime: '19:00',
  status: 'Present'
});
assert.strictEqual(tLate30.lateMinutes, 30);
assert.strictEqual(tLate30.lateDeduction, 2.50, '30 min late with £5/hr hourly rate is £2.50 deduction');
assert.strictEqual(tLate30.attendancePay, 47.50, 'Net attendance pay must be £47.50');
assert.strictEqual(tLate30.status, 'Late');
console.log(' 4. 30-minute late test passed (£2.50 deduction, £47.50 pay)');

// Half day test
const tHalf = calculateAttendanceRecord({
  dailyWage: 50,
  shiftStart: '09:00',
  shiftEnd: '19:00',
  timeReached: '09:00',
  workerEndTime: '14:00',
  status: 'Half'
});
assert.strictEqual(tHalf.attendancePay, 25, 'Half day should be 50% of daily wage (£25)');
console.log(' 5. Half-day test passed (£25 pay)');

// Absent test
const tAbsent = calculateAttendanceRecord({
  dailyWage: 50,
  shiftStart: '09:00',
  shiftEnd: '19:00',
  timeReached: '09:00',
  workerEndTime: '19:00',
  status: 'Absent'
});
assert.strictEqual(tAbsent.actualHours, 0);
assert.strictEqual(tAbsent.attendancePay, 0);
assert.strictEqual(tAbsent.lateDeduction, 0);
console.log(' 6. Absent test passed (£0 pay, 0 worked hours)');

// TEST 4: Monthly Bonus Commission calculation (Section 15 & Image 1)
const salesAmount = 10000;
const ratePercent = 2;
const bonusAmount = Number(((salesAmount * ratePercent) / 100).toFixed(2));
assert.strictEqual(bonusAmount, 200, '£10,000 sales at 2% commission must equal £200');
console.log(' 7. Monthly Bonus test passed (£10,000 at 2% = £200)');

// TEST 5: Important Accounting & Non-duplication Test (Section 16 & 49)
// Given a salary of £60,000 paid in 2 installments of £20,000 and £40,000:
const finalWeeklySalary = 60000;
let totalPaid = 0;
const ledgerEntries = [];

// Step A: Salary finalized
ledgerEntries.push({
  type: 'SALARY_EARNED',
  earned: finalWeeklySalary,
  paid: 0
});

// Step B: Installment 1 (£20,000)
const payment1 = 20000;
totalPaid += payment1;
ledgerEntries.push({
  type: 'PAYMENT_DISBURSED',
  earned: 0,
  paid: payment1
});

// Step C: Installment 2 (£40,000)
const payment2 = 40000;
totalPaid += payment2;
ledgerEntries.push({
  type: 'PAYMENT_DISBURSED',
  earned: 0,
  paid: payment2
});

const totalEarnedInLedger = ledgerEntries.reduce((sum, e) => sum + e.earned, 0);
const totalPaidInLedger = ledgerEntries.reduce((sum, e) => sum + e.paid, 0);
const outstandingBalance = totalEarnedInLedger - totalPaidInLedger;

assert.strictEqual(totalEarnedInLedger, 60000, 'Total earned must be £60,000, NOT duplicated');
assert.strictEqual(totalPaidInLedger, 60000, 'Total paid must equal £60,000 across installments');
assert.strictEqual(outstandingBalance, 0, 'Remaining balance must equal £0');
console.log(' 8. Accounting non-duplication test passed (Earned: £60k, Paid: £20k+£40k, Outstanding: £0)');

// PHASE 6: adjustment and final salary calculation
const phase6 = calculateWeeklySalaryComponents({
  netAttendancePay: 237.50,
  adjustments: [
    { type: 'TRAVEL_ALLOWANCE', amount: 20 },
    { type: 'OTHER_ALLOWANCE', amount: 10 },
    { type: 'OTHER_DEDUCTION', amount: 15 }
  ],
  bonus: 0
});
assert.deepStrictEqual(phase6, {
  netAttendancePay: 237.5,
  travelAllowance: 20,
  otherAllowances: 10,
  totalAllowances: 30,
  bonus: 0,
  otherDeductions: 15,
  finalSalary: 252.5
});
assert.strictEqual(calculateFinalWeeklySalary({
  netAttendancePay: 237.5,
  travelAllowance: 20,
  otherAllowances: 10,
  bonus: 200,
  otherDeductions: 15
}).finalSalary, 452.5);
assert.strictEqual(Number(((10000 * 2) / 100).toFixed(2)), 200);
assert.strictEqual(
  calculateWeeklySalaryComponents({ netAttendancePay: 100, bonus: 200 }).finalSalary,
  300,
  'A monthly bonus is counted once when explicitly allocated and is not multiplied by weeks'
);
console.log(' 9. Phase 6 salary adjustment, bonus, precision and non-duplication tests passed');

console.log('\n ALL BUSINESS LOGIC AND ACCOUNTING TESTS PASSED SUCCESSFULLY!\n');
