const LedgerTransaction = require('../models/LedgerTransaction');

/**
 * Synchronize wage increases / adjustments with the ledger so wage change dates
 * appear as chronological audit milestones with increase date and details.
 */
async function syncWageHistoryToLedger(employee, userId = null) {
  if (!employee || !employee._id) return;
  const EmployeeModel = require('../models/Employee');
  const emp = await EmployeeModel.findById(employee._id).select('wageHistory').lean();
  if (!emp || !emp.wageHistory || emp.wageHistory.length <= 1) return;

  const sorted = [...emp.wageHistory].sort((a, b) => new Date(a.effectiveDate || a.createdAt || 0) - new Date(b.effectiveDate || b.createdAt || 0));

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (Number(curr.wage) !== Number(prev.wage)) {
      const isIncrease = Number(curr.wage) > Number(prev.wage);
      const reasonStr = curr.reason && curr.reason.trim() ? ` (${curr.reason.trim()})` : '';
      const description = `Daily wage ${isIncrease ? 'increased' : 'adjusted'} from £${Number(prev.wage).toFixed(2)} to £${Number(curr.wage).toFixed(2)}${reasonStr}`;
      const txDate = curr.effectiveDate ? new Date(curr.effectiveDate) : new Date();

      await LedgerTransaction.findOneAndUpdate(
        {
          employee: emp._id,
          referenceId: curr._id,
          referenceType: 'WageHistory'
        },
        {
          employee: emp._id,
          date: txDate,
          transactionType: 'WAGE_INCREASE',
          description,
          referenceType: 'WageHistory',
          referenceId: curr._id,
          amountEarned: 0,
          amountPaid: 0,
          breakdown: {
            previousWage: Number(prev.wage),
            newWage: Number(curr.wage),
            effectiveDate: txDate,
            reason: curr.reason || ''
          },
          ...(userId ? { createdBy: userId } : {})
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }

  return await recalculateEmployeeLedger(emp._id);
}

/**
 * Recalculate running balance across all transactions for an employee in chronological order.
 * This guarantees the ledger always stays mathematically consistent.
 */
async function recalculateEmployeeLedger(employeeId) {
  if (!employeeId) return { transactions: [], totalEarned: 0, totalPaid: 0, currentBalance: 0 };

  try {
    const EmployeeModel = require('../models/Employee');
    const emp = await EmployeeModel.findById(employeeId).select('wageHistory').lean();
    if (emp && emp.wageHistory && emp.wageHistory.length > 1) {
      const sorted = [...emp.wageHistory].sort((a, b) => new Date(a.effectiveDate || a.createdAt || 0) - new Date(b.effectiveDate || b.createdAt || 0));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (Number(curr.wage) !== Number(prev.wage)) {
          const isIncrease = Number(curr.wage) > Number(prev.wage);
          const reasonStr = curr.reason && curr.reason.trim() ? ` (${curr.reason.trim()})` : '';
          const description = `Daily wage ${isIncrease ? 'increased' : 'adjusted'} from £${Number(prev.wage).toFixed(2)} to £${Number(curr.wage).toFixed(2)}${reasonStr}`;
          const txDate = curr.effectiveDate ? new Date(curr.effectiveDate) : new Date();

          await LedgerTransaction.findOneAndUpdate(
            {
              employee: employeeId,
              referenceId: curr._id,
              referenceType: 'WageHistory'
            },
            {
              employee: employeeId,
              date: txDate,
              transactionType: 'WAGE_INCREASE',
              description,
              referenceType: 'WageHistory',
              referenceId: curr._id,
              amountEarned: 0,
              amountPaid: 0,
              breakdown: {
                previousWage: Number(prev.wage),
                newWage: Number(curr.wage),
                effectiveDate: txDate,
                reason: curr.reason || ''
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      }
    }
  } catch (err) {
    console.error('Error auto-syncing wage history into ledger:', err.message);
  }

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
    await LedgerTransaction.deleteMany({
      referenceId: bonus._id,
      referenceType: 'Bonus'
    });
  } else if ((bonus.bonusAmount || 0) > 0) {
    const noteStr = bonus.notes && bonus.notes.trim() ? ` - Note: ${bonus.notes.trim()}` : '';
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
        description: `Commission / Bonus for ${bonus.month} ${bonus.year}${bonus.shopName ? ` (${bonus.shopName})` : ''}${noteStr}`,
        referenceType: 'Bonus',
        referenceId: bonus._id,
        bonus: Number(bonus.bonusAmount) || 0,
        amountEarned: Number(bonus.bonusAmount) || 0,
        amountPaid: 0,
        breakdown: {
          bonus: Number(bonus.bonusAmount) || 0,
          salesAmount: Number(bonus.salesAmount) || 0,
          rate: Number(bonus.bonusPercentage) || 0,
          shopName: bonus.shopName || '',
          notes: bonus.notes || ''
        },
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
  syncWageHistoryToLedger,
  removeBonusFromLedger
};
