const mongoose = require('mongoose');

const WeeklySalarySchema = new mongoose.Schema({
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
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  shopName: {
    type: String,
    required: true
  },
  weekStartDate: {
    type: Date,
    required: true
  },
  weekEndDate: {
    type: Date,
    required: true
  },
  weekLabel: {
    type: String, // e.g. "03/08/2026 to 09/08/2026"
    required: true
  },
  weekStartDateString: {
    type: String // "YYYY-MM-DD"
  },
  weekEndDateString: {
    type: String // "YYYY-MM-DD"
  },
  shopsWorked: [{
    type: String
  }],
  workingDays: {
    type: Number,
    default: 0
  },
  scheduledHours: {
    type: Number,
    default: 0
  },
  actualHours: {
    type: Number,
    default: 0
  },
  grossDailyWages: {
    type: Number,
    default: 0
  },
  lateDeductions: {
    type: Number,
    default: 0
  },
  netAttendancePay: {
    type: Number,
    default: 0
  },
  travelAllowance: {
    type: Number,
    default: 0
  },
  otherAllowances: {
    type: Number,
    default: 0
  },
  manualDeductions: {
    type: Number,
    default: 0
  },
  bonus: {
    type: Number,
    default: 0
  },
  finalSalary: {
    type: Number,
    required: true,
    default: 0
  },
  totalPaid: {
    type: Number,
    default: 0
  },
  balanceRemaining: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: [
      'GENERATED', 'DRAFT', 'REVIEWED', 'FINALIZED', 'PAID', 'PARTIALLY_PAID',
      'Generated', 'Draft', 'Reviewed', 'Finalized', 'Paid', 'Partially Paid'
    ],
    default: 'Generated'
  },
  attendanceBreakdown: [{
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' },
    dateString: String,
    dayOfWeek: String,
    shopName: String,
    shiftStart: String,
    shiftEnd: String,
    timeReached: String,
    workerEndTime: String,
    scheduledHours: Number,
    actualHours: Number,
    status: String,
    dailyWage: Number,
    lateMinutes: Number,
    lateDeduction: Number,
    attendancePay: Number,
    remarks: String
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdByName: {
    type: String,
    default: ''
  },
  finalizedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  finalizedAt: {
    type: Date,
    default: null
  },
  finalizationSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  notes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

WeeklySalarySchema.index({ employee: 1, weekLabel: 1 }, { unique: true });

module.exports = mongoose.model('WeeklySalary', WeeklySalarySchema);
