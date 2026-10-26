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

const EmployeeDocumentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    default: 'Proof of Right to Work'
  },
  fileUrl: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    default: ''
  },
  format: {
    type: String,
    default: ''
  },
  bytes: {
    type: Number,
    default: 0
  },
  expiryDate: {
    type: Date,
    default: null
  },
  notes: {
    type: String,
    default: ''
  },
  uploadedAt: {
    type: Date,
    default: Date.now
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
  openingBalance: {
    type: Number,
    default: 0
  },
  openingBalanceDate: {
    type: Date,
    default: Date.now
  },
  openingBalanceNote: {
    type: String,
    default: ''
  },

  // --- Onboarding: Company & Role Details ---
  companyLegalName: { type: String, default: 'Pixx Technologies Ltd' },
  tradingName: { type: String, default: 'Pixx Retail London' },
  jobTitle: { type: String, default: 'Retail Assistant / Sales' },
  workLocation: { type: String, default: '' },
  employmentType: {
    type: String,
    enum: ['Permanent', 'Fixed Term', 'Casual / Zero-Hours', 'Other'],
    default: 'Casual / Zero-Hours'
  },
  normalHoursPerWeek: { type: Number, default: 0 },
  hourlyRate: { type: Number, default: 0 },
  lineManager: { type: String, default: 'Fahad Rasheed' },

  // --- Onboarding: Personal Details ---
  preferredName: { type: String, default: '' },
  dateOfBirth: { type: Date, default: null },
  homeAddress: { type: String, default: '' },
  postcode: { type: String, default: '' },
  nationalInsuranceNumber: { type: String, default: '', trim: true },

  // --- Onboarding: Emergency Contact ---
  emergencyContactName: { type: String, default: '' },
  emergencyContactRelationship: { type: String, default: '' },
  emergencyContactPhone: { type: String, default: '' },

  // --- Onboarding: Payroll & Banking ---
  bankAccountName: { type: String, default: '' },
  bankSortCode: { type: String, default: '' },
  bankAccountNumber: { type: String, default: '' },
  p45Status: {
    type: String,
    enum: ['P45 Received', 'Starter Checklist Completed', 'Pending', 'Not Applicable'],
    default: 'Pending'
  },

  // --- Onboarding: Right to Work & Compliance ---
  rightToWorkCheckMethod: {
    type: String,
    enum: ['Manual eligible documents', 'Home Office online share code', 'Approved digital IDVT', 'Employer Checking Service (ECS)', 'Other'],
    default: 'Manual eligible documents'
  },
  nationalityType: {
    type: String,
    enum: ['British / Irish Citizen', 'Settled / Pre-Settled', 'Student Visa', 'Skilled Worker / Sponsored', 'Graduate / Other Migrant Worker'],
    default: 'British / Irish Citizen'
  },
  rightToWorkReference: { type: String, default: '' },
  rightToWorkCheckDate: { type: Date, default: null },
  rightToWorkStatus: {
    type: String,
    enum: ['Passed', 'Pending - DO NOT START', 'Escalate for advice'],
    default: 'Passed'
  },
  checkerName: { type: String, default: 'Fahad Rasheed' },
  visaExpiryDate: { type: Date, default: null },
  passportExpiryDate: { type: Date, default: null },
  visaConditions: { type: String, default: '' },
  cosReference: { type: String, default: '' },
  healthSafetyInductionCompleted: { type: Boolean, default: true },
  healthSafetyInductionDate: { type: Date, default: Date.now },

  // --- Documents (Cloudinary) ---
  documents: [EmployeeDocumentSchema],

  wageHistory: [WageHistorySchema],
  shopHistory: [ShopHistorySchema]
}, { timestamps: true });

EmployeeSchema.index({ assignedShop: 1 });
EmployeeSchema.index({ employmentStatus: 1 });
EmployeeSchema.index({ name: 1 });
EmployeeSchema.index({ visaExpiryDate: 1 });
EmployeeSchema.index({ passportExpiryDate: 1 });

module.exports = mongoose.model('Employee', EmployeeSchema);
