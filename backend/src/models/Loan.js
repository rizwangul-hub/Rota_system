const mongoose = require('mongoose');

const LoanRepaymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  date: {
    type: Date,
    default: Date.now
  },
  repaymentMethod: {
    type: String,
    enum: ['SALARY_DEDUCTION', 'CASH', 'BANK', 'MANUAL'],
    default: 'SALARY_DEDUCTION'
  },
  weeklySalary: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WeeklySalary',
    default: null
  },
  weekLabel: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  recordedByName: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const LoanSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  employeeName: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: [true, 'Loan amount is required'],
    min: [0.01, 'Loan amount must be greater than zero']
  },
  issueDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  reason: {
    type: String,
    default: 'Employee Advance / Loan'
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'PAID', 'CANCELLED'],
    default: 'ACTIVE'
  },
  totalRepaid: {
    type: Number,
    default: 0
  },
  remainingBalance: {
    type: Number,
    default: 0
  },
  repayments: [LoanRepaymentSchema],
  notes: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdByName: {
    type: String,
    default: ''
  }
}, { timestamps: true });

// Pre-save calculate remaining balance and status
LoanSchema.pre('save', function (next) {
  const sumRepaid = (this.repayments || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  this.totalRepaid = Number(sumRepaid.toFixed(2));
  this.remainingBalance = Number(Math.max(0, this.amount - this.totalRepaid).toFixed(2));

  if (this.status !== 'CANCELLED') {
    if (this.remainingBalance <= 0) {
      this.status = 'PAID';
    } else {
      this.status = 'ACTIVE';
    }
  }
  next();
});

LoanSchema.index({ employee: 1, status: 1 });
LoanSchema.index({ status: 1 });
LoanSchema.index({ issueDate: -1 });

module.exports = mongoose.model('Loan', LoanSchema);
