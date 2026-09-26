const mongoose = require('mongoose');

const WageHistorySchema = new mongoose.Schema({
  wage: {
    type: Number,
    required: true,
    min: 0
  },
  effectiveDate: {
    type: Date,
    default: Date.now
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reason: {
    type: String,
    default: ''
  }
}, { _id: true });

const ShopHistorySchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  shopName: {
    type: String,
    required: true
  },
  effectiveDate: {
    type: Date,
    default: Date.now
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reason: {
    type: String,
    default: ''
  }
}, { _id: true });

const EmployeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Employee name is required'],
    trim: true
  },
  employeeId: {
    type: String,
    required: [true, 'Employee ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  assignedShop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    default: null
  },
  dailyWage: {
    type: Number,
    required: [true, 'Daily wage is required'],
    min: [0, 'Daily wage cannot be negative']
  },
  employmentStatus: {
    type: String,
    enum: ['Active', 'Inactive', 'Suspended'],
    default: 'Active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  },
  wageHistory: [WageHistorySchema],
  shopHistory: [ShopHistorySchema]
}, { timestamps: true });

EmployeeSchema.index({ assignedShop: 1 });
EmployeeSchema.index({ employmentStatus: 1 });
EmployeeSchema.index({ name: 1 });

module.exports = mongoose.model('Employee', EmployeeSchema);
