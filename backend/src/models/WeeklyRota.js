const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  dateKey: { type: String, required: true },
  startTime: { type: String, required: true, default: '09:00' },
  endTime: { type: String, required: true, default: '17:00' },
  scheduledHours: { type: Number, required: true, min: 0, default: 8 },
  status: { type: String, default: 'AVAILABLE' },
  note: { type: String, default: '' },
  homeShopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  locked: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: true });

const StaffingTargetSchema = new mongoose.Schema({
  dateKey: { type: String, required: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  targetWorkers: { type: Number, min: 0, required: true }
}, { _id: false });

const PublishedVersionSchema = new mongoose.Schema({
  version: { type: Number, required: true },
  assignments: { type: [AssignmentSchema], default: [] },
  staffingTargets: { type: [StaffingTargetSchema], default: [] },
  generationMethod: { type: String, enum: ['MANUAL', 'AI_TEXT', 'AI_VOICE'], required: true },
  instructionText: { type: String, default: '' },
  publishedAt: { type: Date, required: true },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: true });

const WeeklyRotaSchema = new mongoose.Schema({
  weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  weekEnd: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  assignments: { type: [AssignmentSchema], default: [] },
  shopRoster: [{
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    employeeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }]
  }],
  staffingTargets: { type: [StaffingTargetSchema], default: [] },
  generationMethod: { type: String, enum: ['MANUAL', 'AI_TEXT', 'AI_VOICE'], default: 'MANUAL' },
  instructionText: { type: String, default: '' },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, default: null },
  validation: { errors: { type: [String], default: [] }, warnings: { type: [String], default: [] } },
  publishedVersions: { type: [PublishedVersionSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, optimisticConcurrency: true });

WeeklyRotaSchema.index({ weekStart: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyRota', WeeklyRotaSchema);
