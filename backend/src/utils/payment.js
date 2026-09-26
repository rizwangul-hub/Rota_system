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

module.exports = { roundMoney, validatePaymentAmount, calculatePaymentState };
