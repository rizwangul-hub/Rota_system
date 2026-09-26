const mongoose = require('mongoose');

const BonusSchema = new mongoose.Schema({
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
  month: {
    type: String, // e.g. "Aug", "May" or "08"
    required: true
  },
  year: {
    type: Number, // e.g. 2026
    required: true
  },
  commitmentText: {
    type: String, // e.g. "1% - Leebridge"
    default: ''
  },
  salesAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  bonusPercentage: {
    type: Number,
    required: true,
    min: 0,
    default: 1
  },
  bonusAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  status: {
    type: String,
    enum: ['DRAFT', 'APPROVED', 'FINALIZED', 'PAID'],
    default: 'APPROVED'
  },
  assignedWeeklySalary: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WeeklySalary',
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdByName: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

BonusSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Bonus', BonusSchema);
