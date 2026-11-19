const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Announcement title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  message: {
    type: String,
    required: [true, 'Announcement message is required'],
    trim: true
  },
  priority: {
    type: String,
    enum: ['Normal', 'Important', 'Urgent'],
    default: 'Normal',
    index: true
  },
  targetType: {
    type: String,
    enum: ['ALL', 'SHOPS', 'EMPLOYEES'],
    default: 'ALL'
  },
  targetShops: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop'
  }],
  targetEmployees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  }],
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  publishedByName: {
    type: String,
    default: 'Management'
  },
  publishedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    default: null
  },
  attachment: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['Draft', 'Published', 'Archived'],
    default: 'Published',
    index: true
  },
  readBy: [{
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

AnnouncementSchema.index({ status: 1, publishedAt: -1 });
AnnouncementSchema.index({ targetType: 1 });
AnnouncementSchema.index({ 'readBy.employee': 1 });

module.exports = mongoose.model('Announcement', AnnouncementSchema);
