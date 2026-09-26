const mongoose = require('mongoose');

const SalaryAdjustmentSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['TRAVEL_ALLOWANCE', 'OTHER_ALLOWANCE', 'OTHER_DEDUCTION', 'MANUAL_DEDUCTION'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  reason: {
    type: String,
    required: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  addedByName: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('SalaryAdjustment', SalaryAdjustmentSchema);
