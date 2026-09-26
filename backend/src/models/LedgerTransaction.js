const mongoose = require('mongoose');

const LedgerTransactionSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  transactionType: {
    type: String,
    enum: [
      'SALARY_EARNED',       // Weekly salary finalized
      'PAYMENT_DISBURSED',   // Legacy name for salary payment
      'SALARY_PAYMENT',      // Paid to worker (Cash/Bank)
      'BONUS_CREDIT',        // Monthly sales bonus credited
      'MANUAL_ADJUSTMENT'    // Explicit ledger balance correction
    ],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  referenceType: {
    type: String,
    enum: ['WeeklySalary', 'SalaryPayment', 'Bonus', 'Manual'],
    required: true
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  // Detailed breakdown columns
  attendancePay: { type: Number, default: 0 },
  lateDeduction: { type: Number, default: 0 },
  allowance: { type: Number, default: 0 },
  bonus: { type: Number, default: 0 },
  otherDeduction: { type: Number, default: 0 },
  // Accounting debit/credit
  amountEarned: { type: Number, default: 0 }, // Increases what company owes employee
  amountPaid: { type: Number, default: 0 },   // Reduces what company owes employee
  runningBalance: { type: Number, default: 0 }, // Positive = outstanding amount owed to employee
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

// Prevent duplicate ledger entry for the same earning transaction
LedgerTransactionSchema.index({ employee: 1, transactionType: 1, referenceId: 1 }, { unique: true });
LedgerTransactionSchema.index({ employee: 1, date: 1 });

module.exports = mongoose.model('LedgerTransaction', LedgerTransactionSchema);
