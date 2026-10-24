function roundMoney(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new TypeError('Monetary values must be finite numbers.');
  }
  return Number(numericValue.toFixed(2));
}

function validatePaymentAmount(amount, outstanding) {
  const numericAmount = Number(amount);
  const numericOutstanding = Number(outstanding);
  if (!Number.isFinite(numericOutstanding) || numericOutstanding < 0) {
    return { valid: false, message: 'Outstanding balance is invalid.' };
  }
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { valid: false, message: 'Payment amount must be greater than zero.' };
  }
  const roundedAmount = roundMoney(numericAmount);
  if (roundedAmount <= 0) {
    return { valid: false, message: 'Payment amount must be at least £0.01.' };
  }
  const remaining = roundMoney(numericOutstanding);
  if (roundedAmount > remaining) {
    return {
      valid: false,
      message: `Payment exceeds the outstanding balance. Maximum remaining payment is £${remaining.toFixed(2)}.`
    };
  }
  return { valid: true, amount: roundedAmount };
}

function calculatePaymentState(finalSalary, paidBefore, paymentAmount) {
  const salary = roundMoney(finalSalary);
  const previousPaid = roundMoney(paidBefore);
  const payment = roundMoney(paymentAmount);
  if (salary < 0 || previousPaid < 0 || payment <= 0) {
    throw new RangeError('Salary and payment values must be non-negative, with a positive payment.');
  }
  const totalPaid = roundMoney(previousPaid + payment);
  const balanceRemaining = roundMoney(Math.max(0, salary - totalPaid));
  return {
    totalPaid,
    balanceRemaining,
    status: balanceRemaining === 0 ? 'PAID' : 'PARTIALLY_PAID'
  };
}

module.exports = { roundMoney, validatePaymentAmount, calculatePaymentState, getSalaryFinancialBreakdown };

/**
 * Accurately compute financial breakdown for a weekly salary record:
 * - Opening balance: remaining unpaid amount from previous week (or employee initial opening for week 1)
 * - Bonus: bonus awarded specifically for this week (assigned to salary or created within week date range)
 * - Weekly salary: final salary earned for this week
 * - Total payable: Opening + Weekly Salary + Bonus
 * - Total paid: payments made against this salary
 * - Balance remaining: max(0, Total Payable - Total Paid)
 */
async function getSalaryFinancialBreakdown(salaryDocOrId, session = null) {
  const WeeklySalary = require('../models/WeeklySalary');
  const Employee = require('../models/Employee');
  const Bonus = require('../models/Bonus');

  let salary = salaryDocOrId;
  if (!salary || !salary.employee) {
    salary = await WeeklySalary.findById(salaryDocOrId).session(session);
  }
  if (!salary) return null;

  const empId = salary.employee._id ? salary.employee._id : salary.employee;
  const emp = await Employee.findById(empId).session(session);
  const initialOpening = Number(emp?.openingBalance || 0);

  // Get all salaries for this employee up to and including this salary, sorted chronologically
  const sDate = new Date(salary.weekStartDate);
  const allSalariesQuery = WeeklySalary.find({
    employee: empId,
    weekStartDate: { $lte: sDate }
  }).sort({ weekStartDate: 1 });
  if (session) allSalariesQuery.session(session);
  const allSalaries = await allSalariesQuery;

  const bonusesQuery = Bonus.find({ employee: empId, status: { $ne: 'DRAFT' } }).lean();
  if (session) bonusesQuery.session(session);
  const empBonuses = await bonusesQuery;

  let runningRemaining = initialOpening;
  let result = null;

  for (let i = 0; i < allSalaries.length; i++) {
    const s = allSalaries[i];
    const isTarget = s._id.toString() === salary._id.toString();
    const opening = i === 0 ? initialOpening : runningRemaining;

    const sStart = new Date(s.weekStartDate);
    const sEnd = new Date(s.weekEndDate);
    sEnd.setHours(23, 59, 59, 999);

    const weekBonusFromDocs = empBonuses.filter(b => {
      if (b.assignedWeeklySalary) {
        return b.assignedWeeklySalary.toString() === s._id.toString();
      }
      const bDate = new Date(b.createdAt);
      return bDate >= sStart && bDate <= sEnd;
    }).reduce((sum, b) => sum + (Number(b.bonusAmount) || 0), 0);

    const bonus = Number(((s.bonus || 0) > 0 ? s.bonus : weekBonusFromDocs).toFixed(2));
    const weeklySalary = Number(s.finalSalary || 0);
    const totalPayable = Number((opening + weeklySalary + bonus).toFixed(2));
    const totalPaid = Number(s.totalPaid || 0);
    const balanceRemaining = Number(Math.max(0, totalPayable - totalPaid).toFixed(2));

    runningRemaining = balanceRemaining;

    if (isTarget) {
      result = {
        openingBalance: opening,
        bonus,
        weeklySalary,
        totalPayable,
        totalPaid,
        balanceRemaining
      };
      break;
    }
  }

  if (!result) {
    result = {
      openingBalance: initialOpening,
      bonus: Number(salary.bonus || 0),
      weeklySalary: Number(salary.finalSalary || 0),
      totalPayable: Number(((salary.finalSalary || 0) + initialOpening + (salary.bonus || 0)).toFixed(2)),
      totalPaid: Number(salary.totalPaid || 0),
      balanceRemaining: Number(Math.max(0, ((salary.finalSalary || 0) + initialOpening + (salary.bonus || 0)) - (salary.totalPaid || 0)).toFixed(2))
    };
  }

  return result;
}
