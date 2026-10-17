const LedgerTransaction = require('../models/LedgerTransaction');

/**
 * Recalculate running balance across all transactions for an employee in chronological order.
 * This guarantees the ledger always stays mathematically consistent.
 */
async function recalculateEmployeeLedger(employeeId) {
  if (!employeeId) return { transactions: [], totalEarned: 0, totalPaid: 0, currentBalance: 0 };

  const transactions = await LedgerTransaction.find({ employee: employeeId })
    .sort({ date: 1, createdAt: 1 });

  let running = 0;
  let totalEarned = 0;
  let totalPaid = 0;

  for (const t of transactions) {
    const earned = Number(t.amountEarned) || 0;
    const paid = Number(t.amountPaid) || 0;
    totalEarned += earned;
    totalPaid += paid;
    running = Number((running + earned - paid).toFixed(2));
    if (t.runningBalance !== running) {
      t.runningBalance = running;
      await t.save();
    }
  }

  return {
    transactions,
    totalEarned: Number(totalEarned.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    currentBalance: running
  };
}

/**
 * Synchronize the employee's opening balance with the ledger.
 */
async function syncEmployeeOpeningBalance(employee, openingBalance, openingBalanceDate, openingBalanceNote, userId = null) {
  if (!employee || !employee._id) return;
  const balance = Number(openingBalance) || 0;

  if (balance !== 0) {
    const txDate = openingBalanceDate ? new Date(openingBalanceDate) : (employee.startDate ? new Date(employee.startDate) : new Date());
    // Ensure date is set to early morning so it precedes any same-day attendance transactions
    txDate.setHours(0, 0, 0, 0);

    const amountEarned = balance >= 0 ? balance : 0;
    const amountPaid = balance < 0 ? Math.abs(balance) : 0;
    const description = openingBalanceNote && openingBalanceNote.trim()
      ? `Opening Balance: ${openingBalanceNote.trim()}`
      : 'Opening Balance brought forward';

    await LedgerTransaction.findOneAndUpdate(
      {
        employee: employee._id,
        transactionType: 'OPENING_BALANCE'
      },
      {
        employee: employee._id,
        date: txDate,
        transactionType: 'OPENING_BALANCE',
        description,
        referenceType: 'OpeningBalance',
        referenceId: employee._id,
        amountEarned,
        amountPaid,
        ...(userId ? { createdBy: userId } : {})
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } else {
    // If balance is 0, remove opening balance entry
    await LedgerTransaction.deleteMany({
      employee: employee._id,
      transactionType: 'OPENING_BALANCE'
    });
  }

  return await recalculateEmployeeLedger(employee._id);
}

/**
 * Synchronize standalone bonuses with the ledger.
 * If bonus is assigned to a weekly salary, it is included inside that salary's SALARY_EARNED transaction.
 * If bonus is NOT assigned to a weekly salary, it gets its own BONUS_CREDIT transaction.
 */
async function syncBonusToLedger(bonus, userId = null) {
  if (!bonus || !bonus.employee) return;

  if (bonus.assignedWeeklySalary) {
    // Assigned to weekly salary: remove standalone transaction to avoid double counting
    await LedgerTransaction.deleteMany({
      referenceId: bonus._id,
      referenceType: 'Bonus'
    });
  } else if ((bonus.bonusAmount || 0) > 0) {
    // Standalone bonus: create/update BONUS_CREDIT transaction
    await LedgerTransaction.findOneAndUpdate(
      {
        employee: bonus.employee,
        referenceId: bonus._id,
        referenceType: 'Bonus'
      },
      {
        employee: bonus.employee,
        date: bonus.createdAt ? new Date(bonus.createdAt) : new Date(),
        transactionType: 'BONUS_CREDIT',
        description: `Commission / Bonus for ${bonus.month} ${bonus.year}${bonus.shopName ? ` (${bonus.shopName})` : ''}`,
        referenceType: 'Bonus',
        referenceId: bonus._id,
        bonus: Number(bonus.bonusAmount) || 0,
        amountEarned: Number(bonus.bonusAmount) || 0,
        amountPaid: 0,
        ...(userId ? { createdBy: userId } : {})
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } else {
    await LedgerTransaction.deleteMany({
      referenceId: bonus._id,
      referenceType: 'Bonus'
    });
  }

  return await recalculateEmployeeLedger(bonus.employee);
}

/**
 * Remove bonus from ledger when deleted
 */
async function removeBonusFromLedger(bonusId, employeeId) {
  await LedgerTransaction.deleteMany({
    referenceId: bonusId,
    referenceType: 'Bonus'
  });
  if (employeeId) {
    await recalculateEmployeeLedger(employeeId);
  }
}

module.exports = {
  recalculateEmployeeLedger,
  syncEmployeeOpeningBalance,
  syncBonusToLedger,
  removeBonusFromLedger
};
