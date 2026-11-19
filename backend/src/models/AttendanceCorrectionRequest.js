const mongoose = require('mongoose');

const AttendanceCorrectionRequestSchema = new mongoose.Schema({
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
    type: String, // PIXX---
    required: true
  },
  attendance: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attendance',
    default: null
  },
  dateString: {
    type: String, // YYYY-MM-DD
    required: true
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    default: null
  },
  shopName: {
    type: String,
    default: ''
  },
  issueType: {
    type: String,
    required: true,
    enum: [
      'INCORRECT_ARRIVAL_TIME',
      'INCORRECT_LEAVING_TIME',
      'MISSING_ATTENDANCE',
      'WRONG_SHOP',
      'WRONG_STATUS',
      'OTHER'
    ]
  },
  issueLabel: {
    type: String,
    default: ''
  },
  originalValues: {
    shiftStart: { type: String, default: '' },
    shiftEnd: { type: String, default: '' },
    timeReached: { type: String, default: '' },
    workerEndTime: { type: String, default: '' },
    actualHours: { type: Number, default: 0 },
    lateMinutes: { type: Number, default: 0 },
    status: { type: String, default: '' },
    shopName: { type: String, default: '' },
    approvalStatus: { type: String, default: '' }
  },
  proposedChanges: {
    timeReached: { type: String, default: '' },
    workerEndTime: { type: String, default: '' },
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    shopName: { type: String, default: '' },
    status: { type: String, default: '' }
  },
  explanation: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedByName: {
    type: String,
    default: ''
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  reviewerNotes: {
    type: String,
    default: ''
  },
  workerResponse: {
    type: String,
    default: ''
  }
}, { timestamps: true });

AttendanceCorrectionRequestSchema.index({ employee: 1, dateString: 1, status: 1 });
AttendanceCorrectionRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('AttendanceCorrectionRequest', AttendanceCorrectionRequestSchema);
