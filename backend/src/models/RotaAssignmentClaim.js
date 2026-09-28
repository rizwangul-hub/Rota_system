const mongoose = require('mongoose');

const RotaAssignmentClaimSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  rotaId: { type: mongoose.Schema.Types.ObjectId, ref: 'WeeklyRota', required: true },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true }
}, { timestamps: true });

RotaAssignmentClaimSchema.index({ employeeId: 1, dateKey: 1 }, { unique: true });
RotaAssignmentClaimSchema.index({ rotaId: 1 });

module.exports = mongoose.model('RotaAssignmentClaim', RotaAssignmentClaimSchema);
