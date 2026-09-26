const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  dateString: {
    type: String, // "YYYY-MM-DD" for indexing & uniqueness per employee
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
  employeeId: {
    type: String,
    required: true
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: function() { return this.status !== 'Absent'; },
    default: null
  },
  shopName: {
    type: String,
    required: function() { return this.status !== 'Absent'; },
    default: function() { return this.status === 'Absent' ? 'Absent' : ''; }
  },
  shiftStart: {
    type: String,
    default: '09:00'
  },
  timeReached: {
    type: String,
    required: function() { return this.status !== 'Absent'; },
    default: ''
  },
  shiftEnd: {
    type: String,
    default: '19:00'
  },
  workerEndTime: {
    type: String,
    required: function() { return this.status !== 'Absent'; },
    default: ''
  },
  scheduledHours: {
    type: Number,
    required: true,
    default: 0
  },
  actualHours: {
    type: Number,
    required: true,
    default: 0
  },
  lateMinutes: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Present', 'Late', 'Half', 'Absent'],
    default: 'Present'
  },
  dailyWage: {
    type: Number,
    required: true
  },
  hourlyWage: {
    type: Number,
    required: true
  },
  lateDeduction: {
    type: Number,
    default: 0
  },
  attendancePay: {
    type: Number,
    required: true
  },
  remarks: {
    type: String,
    default: ''
  },
  approvalStatus: {
    type: String,
    enum: ['Draft', 'Saved', 'Pending Review', 'Checked', 'Finalized'],
    default: 'Pending Review'
  },
  weeklySalary: {
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
    default: 'Usman Salahuddin'
  },
  checkedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  checkedByName: {
    type: String,
    default: ''
  },
  checkedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Prevent duplicate attendance for the same employee on the same date
AttendanceSchema.index({ employee: 1, dateString: 1 }, { unique: true });
AttendanceSchema.index({ shop: 1, dateString: 1 });
AttendanceSchema.index({ approvalStatus: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);

