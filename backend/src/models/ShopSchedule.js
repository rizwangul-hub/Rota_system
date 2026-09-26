const mongoose = require('mongoose');

const ShopScheduleSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    default: null // null applies as default schedule for all shops
  },
  dayOfWeek: {
    type: Number, // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    required: true,
    min: 0,
    max: 6
  },
  dayName: {
    type: String,
    required: true
  },
  openingTime: {
    type: String,
    required: true, // "09:00", "11:00"
    default: '09:00'
  },
  closingTime: {
    type: String,
    required: true, // "19:00", "18:00", "17:00"
    default: '19:00'
  },
  defaultHours: {
    type: Number,
    default: 10
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

ShopScheduleSchema.index({ shop: 1, dayOfWeek: 1 }, { unique: true });

module.exports = mongoose.model('ShopSchedule', ShopScheduleSchema);
