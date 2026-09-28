const mongoose = require('mongoose');

const IntervalSchema = new mongoose.Schema({
  startTime: { type: String, required: true },
  endTime: { type: String, required: true }
}, { _id: false });

const RotaAvailabilitySchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, enum: ['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'], required: true },
  intervals: { type: [IntervalSchema], default: [] },
  confirmed: { type: Boolean, default: false },
  reason: { type: String, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

RotaAvailabilitySchema.index({ employeeId: 1, dateKey: 1 }, { unique: true });
RotaAvailabilitySchema.index({ dateKey: 1 });

module.exports = mongoose.model('RotaAvailability', RotaAvailabilitySchema);
