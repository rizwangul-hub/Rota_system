const mongoose = require('mongoose');

const SalaryPaymentSchema = new mongoose.Schema({
  weeklySalary: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WeeklySalary',
    required: true
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  employeeName: {
    type: String,
    required: true
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  shopName: {
    type: String,
    required: true
  },
  weekLabel: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank'],
    default: 'Cash'
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  paidByName: {
    type: String,
    default: 'Salary Distributor'
  },
  notes: {
    type: String,
    default: ''
  },
  clientReference: {
    type: String,
    index: {
      unique: true,
      partialFilterExpression: { clientReference: { $type: 'string' } }
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('SalaryPayment', SalaryPaymentSchema);
