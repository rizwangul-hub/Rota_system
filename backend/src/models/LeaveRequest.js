const mongoose = require('mongoose');

const LeaveRequestSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'Employee reference is required'],
    index: true
  },
  userAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User account reference is required']
  },
  leaveType: {
    type: String,
    enum: ['Annual Leave', 'Sick Leave', 'Emergency Leave', 'Unpaid Leave', 'Other'],
    required: [true, 'Leave type is required']
  },
  startDate: {
    type: String,
    required: [true, 'Start date is required'],
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format']
  },
  endDate: {
    type: String,
    required: [true, 'End date is required'],
    match: [/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format']
  },
  totalDays: {
    type: Number,
    required: [true, 'Total days is required'],
    min: [1, 'Leave must be for at least 1 day']
  },
  reason: {
    type: String,
    required: [true, 'Reason for leave is required'],
    trim: true,
    maxlength: [1000, 'Reason cannot exceed 1000 characters']
  },
  attachment: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
    default: 'Pending',
    index: true
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
  reviewRemarks: {
    type: String,
    trim: true,
    default: ''
  },
  cancelledAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

LeaveRequestSchema.index({ employee: 1, status: 1 });
LeaveRequestSchema.index({ startDate: 1, endDate: 1 });
LeaveRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('LeaveRequest', LeaveRequestSchema);
