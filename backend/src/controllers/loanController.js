const Loan = require('../models/Loan');
const Employee = require('../models/Employee');
const WeeklySalary = require('../models/WeeklySalary');
const { logAction } = require('../utils/audit');
const { sendServerError } = require('../utils/httpErrors');
const { safeObjectId } = require('../utils/calc');

/**
 * 1. Create a new Loan / Cash Advance for an employee
 */
exports.createLoan = async (req, res) => {
  try {
    const { employeeId, amount, issueDate, reason, notes } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee is required.' });
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Loan amount must be a positive number.' });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const loan = new Loan({
      employee: employee._id,
      employeeName: employee.name,
      employeeId: employee.employeeId,
      amount: Number(numAmount.toFixed(2)),
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      reason: reason || 'Employee Advance / Loan',
      notes: notes || '',
      status: 'ACTIVE',
      totalRepaid: 0,
      remainingBalance: Number(numAmount.toFixed(2)),
      createdBy: req.user?._id,
      createdByName: req.user?.name || 'Admin'
    });

    await loan.save();

    await logAction({
      user: req.user,
      action: 'LOAN_CREATED',
      recordType: 'Loan',
      recordId: loan._id,
      details: `Disbursed loan of £${loan.amount.toFixed(2)} to ${employee.name} (${employee.employeeId})`,
      req
    });

    res.status(201).json({
      success: true,
      message: `Loan of £${loan.amount.toFixed(2)} created for ${employee.name}.`,
      loan
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to create employee loan.');
  }
};

/**
 * 2. Get Employee Loans and complete chronological Loan Ledger
 */
exports.getEmployeeLoans = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const eId = safeObjectId(employeeId);
    if (!eId) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
    }

    const employee = await Employee.findById(eId).select('name employeeId dailyWage openingBalance');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const loans = await Loan.find({ employee: eId, status: { $ne: 'CANCELLED' } }).sort({ issueDate: -1 });

    const totalBorrowed = Number(loans.reduce((sum, l) => sum + (l.amount || 0), 0).toFixed(2));
    const totalRepaid = Number(loans.reduce((sum, l) => sum + (l.totalRepaid || 0), 0).toFixed(2));
    const activeLoans = loans.filter(l => l.status === 'ACTIVE');
    const remainingBalance = Number(activeLoans.reduce((sum, l) => sum + (l.remainingBalance || 0), 0).toFixed(2));

    // Construct chronological Loan Ledger (Loans borrowed vs Repayments)
    const ledgerEvents = [];

    loans.forEach(loan => {
      // Loan disbursement event
      ledgerEvents.push({
        date: loan.issueDate,
        createdAt: loan.createdAt,
        type: 'LOAN_DISBURSED',
        typeLabel: 'Loan Given / Advance',
        loanId: loan._id,
        amountBorrowed: loan.amount,
        amountRepaid: 0,
        reference: loan.reason || 'Advance Disbursed',
        notes: loan.notes || '',
        recordedBy: loan.createdByName || 'Admin'
      });

      // Repayment events
      (loan.repayments || []).forEach(rep => {
        ledgerEvents.push({
          date: rep.date,
          createdAt: rep.createdAt || rep.date,
          type: 'LOAN_REPAYMENT',
          typeLabel: rep.repaymentMethod === 'SALARY_DEDUCTION' ? 'Deducted from Salary' : 'Direct Repayment',
          loanId: loan._id,
          amountBorrowed: 0,
          amountRepaid: rep.amount,
          reference: rep.weekLabel ? `Week ${rep.weekLabel}` : (rep.repaymentMethod || 'Repayment'),
          notes: rep.notes || '',
          recordedBy: rep.recordedByName || 'Admin',
          weeklySalaryId: rep.weeklySalary
        });
      });
    });

    // Sort chronologically ascending
    ledgerEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running loan balance
    let runningLoanBalance = 0;
    const ledger = ledgerEvents.map(evt => {
      runningLoanBalance += evt.amountBorrowed - evt.amountRepaid;
      return {
        ...evt,
        runningLoanBalance: Number(Math.max(0, runningLoanBalance).toFixed(2))
      };
    });

    res.json({
      success: true,
      employee,
      summary: {
        totalBorrowed,
        totalRepaid,
        remainingBalance,
        activeLoansCount: activeLoans.length
      },
      loans,
      ledger
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch employee loan ledger.');
  }
};

/**
 * 3. Get all loans across system with filters
 */
exports.getAllLoans = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'All') {
      query.status = status;
    } else {
      query.status = { $ne: 'CANCELLED' };
    }

    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { employeeName: { $regex: q, $options: 'i' } },
        { employeeId: { $regex: q, $options: 'i' } },
        { reason: { $regex: q, $options: 'i' } }
      ];
    }

    const loans = await Loan.find(query).sort({ issueDate: -1 });

    const totalActiveBalance = Number(
      loans.filter(l => l.status === 'ACTIVE').reduce((sum, l) => sum + (l.remainingBalance || 0), 0).toFixed(2)
    );
    const totalBorrowed = Number(loans.reduce((sum, l) => sum + (l.amount || 0), 0).toFixed(2));
    const totalRepaid = Number(loans.reduce((sum, l) => sum + (l.totalRepaid || 0), 0).toFixed(2));

    const activeEmployees = new Set(loans.filter(l => l.status === 'ACTIVE' && l.remainingBalance > 0).map(l => l.employeeId));

    res.json({
      success: true,
      summary: {
        totalActiveBalance,
        totalBorrowed,
        totalRepaid,
        totalLoansCount: loans.length,
        activeWorkersCount: activeEmployees.size
      },
      loans
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to list employee loans.');
  }
};

/**
 * 4. Record a direct loan repayment (Cash/Bank outside salary)
 */
exports.recordRepayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { amount, date, repaymentMethod, notes } = req.body;

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Repayment amount must be positive.' });
    }

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan record not found.' });
    }

    if (numAmount > loan.remainingBalance) {
      return res.status(400).json({
        success: false,
        message: `Repayment amount (£${numAmount.toFixed(2)}) cannot exceed remaining balance (£${loan.remainingBalance.toFixed(2)}).`
      });
    }

    loan.repayments.push({
      amount: Number(numAmount.toFixed(2)),
      date: date ? new Date(date) : new Date(),
      repaymentMethod: repaymentMethod || 'CASH',
      notes: notes || 'Direct repayment',
      recordedBy: req.user?._id,
      recordedByName: req.user?.name || 'Admin',
      createdAt: new Date()
    });

    await loan.save();

    await logAction({
      user: req.user,
      action: 'LOAN_REPAID',
      recordType: 'Loan',
      recordId: loan._id,
      details: `Recorded repayment of £${numAmount.toFixed(2)} for ${loan.employeeName} (${loan.employeeId}) via ${repaymentMethod || 'CASH'}`,
      req
    });

    res.json({
      success: true,
      message: `Repayment of £${numAmount.toFixed(2)} recorded successfully. Remaining balance: £${loan.remainingBalance.toFixed(2)}.`,
      loan
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to record loan repayment.');
  }
};

/**
 * 5. Delete or cancel a loan
 */
exports.deleteLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found.' });
    }

    if (loan.repayments && loan.repayments.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete loan because repayments have already been recorded. Mark it as cancelled or adjust balance instead.'
      });
    }

    await Loan.findByIdAndDelete(loanId);

    await logAction({
      user: req.user,
      action: 'LOAN_DELETED',
      recordType: 'Loan',
      recordId: loanId,
      details: `Deleted loan of £${loan.amount.toFixed(2)} for ${loan.employeeName}`,
      req
    });

    res.json({ success: true, message: 'Loan deleted successfully.' });
  } catch (error) {
    return sendServerError(res, error, 'Failed to delete loan.');
  }
};

/**
 * Helper: Apply loan deduction from a weekly salary when finalizing
 */
exports.applySalaryLoanDeduction = async (employeeId, weeklySalaryDoc, deductionAmount, user) => {
  const dedAmt = Number(deductionAmount);
  if (isNaN(dedAmt) || dedAmt <= 0) return;

  // Find active loans for employee sorted by oldest first
  const activeLoans = await Loan.find({
    employee: employeeId,
    status: 'ACTIVE',
    remainingBalance: { $gt: 0 }
  }).sort({ issueDate: 1 });

  let unallocated = dedAmt;

  for (const loan of activeLoans) {
    if (unallocated <= 0) break;
    const payAmt = Math.min(unallocated, loan.remainingBalance);

    // Check if repayment for this weekly salary was already recorded (idempotence)
    const existingRepIdx = (loan.repayments || []).findIndex(
      r => r.weeklySalary && r.weeklySalary.toString() === weeklySalaryDoc._id.toString()
    );

    if (existingRepIdx !== -1) {
      // Update existing repayment
      loan.repayments[existingRepIdx].amount = Number(payAmt.toFixed(2));
      loan.repayments[existingRepIdx].date = weeklySalaryDoc.weekEndDate || new Date();
    } else {
      loan.repayments.push({
        amount: Number(payAmt.toFixed(2)),
        date: weeklySalaryDoc.weekEndDate || new Date(),
        repaymentMethod: 'SALARY_DEDUCTION',
        weeklySalary: weeklySalaryDoc._id,
        weekLabel: weeklySalaryDoc.weekLabel,
        notes: `Deducted from Weekly Salary (${weeklySalaryDoc.weekLabel})`,
        recordedBy: user?._id,
        recordedByName: user?.name || 'Admin',
        createdAt: new Date()
      });
    }

    await loan.save();
    unallocated = Number((unallocated - payAmt).toFixed(2));
  }
};

/**
 * Helper: Revert salary loan deduction if salary is unfinalized
 */
exports.revertSalaryLoanDeduction = async (weeklySalaryId) => {
  if (!weeklySalaryId) return;
  const loans = await Loan.find({
    'repayments.weeklySalary': weeklySalaryId
  });

  for (const loan of loans) {
    loan.repayments = loan.repayments.filter(
      r => !r.weeklySalary || r.weeklySalary.toString() !== weeklySalaryId.toString()
    );
    await loan.save();
  }
};
