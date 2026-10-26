import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { downloadReportFile } from '../utils/downloadReportFile';
import {
  X, User, Building2, Banknote, ShieldCheck, FileText, Upload,
  Calendar, Clock, CheckCircle2, AlertCircle, Trash2, Eye, Download,
  ExternalLink, Plus, RefreshCw, AlertTriangle
} from 'lucide-react';

export default function EmployeeJoiningModal({
  isOpen,
  onClose,
  employee = null, // null for create, object for edit
  defaultTab = 'personal',
  onSaved,
  shops = []
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [nextEmployeeId, setNextEmployeeId] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    employeeId: '',
    preferredName: '',
    dateOfBirth: '',
    phone: '',
    email: '',
    homeAddress: '',
    postcode: '',
    nationalInsuranceNumber: '',
    emergencyContactName: '',
    emergencyContactRelationship: '',
    emergencyContactPhone: '',

    // Company & Role
    companyLegalName: 'Pixx Technologies Ltd',
    tradingName: 'Pixx Retail London',
    assignedShop: '',
    jobTitle: 'Retail Assistant / Sales',
    workLocation: '',
    employmentType: 'Casual / Zero-Hours',
    startDate: new Date().toISOString().split('T')[0],
    dailyWage: '',
    hourlyRate: '',
    normalHoursPerWeek: '',
    lineManager: 'Fahad Rasheed',
    openingBalance: '',
    openingBalanceDate: new Date().toISOString().split('T')[0],
    openingBalanceNote: '',
    notes: '',

    // Payroll & Banking
    bankAccountName: '',
    bankSortCode: '',
    bankAccountNumber: '',
    p45Status: 'Pending',

    // Right to Work & Visa
    rightToWorkCheckMethod: 'Manual eligible documents',
    nationalityType: 'British / Irish Citizen',
    rightToWorkReference: '',
    rightToWorkCheckDate: new Date().toISOString().split('T')[0],
    rightToWorkStatus: 'Passed',
    checkerName: 'Fahad Rasheed',
    visaExpiryDate: '',
    passportExpiryDate: '',
    visaConditions: '',
    cosReference: '',
    healthSafetyInductionCompleted: true,
    healthSafetyInductionDate: new Date().toISOString().split('T')[0],

    // Documents
    documents: []
  });

  // Document Upload State
  const [uploadCategory, setUploadCategory] = useState('Proof of Right to Work');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadExpiryDate, setUploadExpiryDate] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState('');

  useEffect(() => {
    if (defaultTab) setActiveTab(defaultTab);
  }, [defaultTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (employee) {
      // Editing existing employee
      setFormData({
        name: employee.name || '',
        employeeId: employee.employeeId || '',
        preferredName: employee.preferredName || '',
        dateOfBirth: employee.dateOfBirth ? String(employee.dateOfBirth).slice(0, 10) : '',
        phone: employee.phone || '',
        email: employee.email || '',
        homeAddress: employee.homeAddress || '',
        postcode: employee.postcode || '',
        nationalInsuranceNumber: employee.nationalInsuranceNumber || '',
        emergencyContactName: employee.emergencyContactName || '',
        emergencyContactRelationship: employee.emergencyContactRelationship || '',
        emergencyContactPhone: employee.emergencyContactPhone || '',

        companyLegalName: employee.companyLegalName || 'Pixx Technologies Ltd',
        tradingName: employee.tradingName || 'Pixx Retail London',
        assignedShop: employee.assignedShop?._id || employee.assignedShop || '',
        jobTitle: employee.jobTitle || 'Retail Assistant / Sales',
        workLocation: employee.workLocation || '',
        employmentType: employee.employmentType || 'Casual / Zero-Hours',
        startDate: employee.startDate ? String(employee.startDate).slice(0, 10) : new Date().toISOString().split('T')[0],
        dailyWage: employee.dailyWage !== undefined ? String(employee.dailyWage) : '',
        hourlyRate: employee.hourlyRate !== undefined ? String(employee.hourlyRate) : '',
        normalHoursPerWeek: employee.normalHoursPerWeek !== undefined ? String(employee.normalHoursPerWeek) : '',
        lineManager: employee.lineManager || 'Fahad Rasheed',
        openingBalance: employee.openingBalance !== undefined ? String(employee.openingBalance) : '0',
        openingBalanceDate: employee.openingBalanceDate ? String(employee.openingBalanceDate).slice(0, 10) : '',
        openingBalanceNote: employee.openingBalanceNote || '',
        notes: employee.notes || '',

        bankAccountName: employee.bankAccountName || '',
        bankSortCode: employee.bankSortCode || '',
        bankAccountNumber: employee.bankAccountNumber || '',
        p45Status: employee.p45Status || 'Pending',

        rightToWorkCheckMethod: employee.rightToWorkCheckMethod || 'Manual eligible documents',
        nationalityType: employee.nationalityType || 'British / Irish Citizen',
        rightToWorkReference: employee.rightToWorkReference || '',
        rightToWorkCheckDate: employee.rightToWorkCheckDate ? String(employee.rightToWorkCheckDate).slice(0, 10) : '',
        rightToWorkStatus: employee.rightToWorkStatus || 'Passed',
        checkerName: employee.checkerName || 'Fahad Rasheed',
        visaExpiryDate: employee.visaExpiryDate ? String(employee.visaExpiryDate).slice(0, 10) : '',
        passportExpiryDate: employee.passportExpiryDate ? String(employee.passportExpiryDate).slice(0, 10) : '',
        visaConditions: employee.visaConditions || '',
        cosReference: employee.cosReference || '',
        healthSafetyInductionCompleted: employee.healthSafetyInductionCompleted !== undefined ? Boolean(employee.healthSafetyInductionCompleted) : true,
        healthSafetyInductionDate: employee.healthSafetyInductionDate ? String(employee.healthSafetyInductionDate).slice(0, 10) : '',

        documents: Array.isArray(employee.documents) ? employee.documents : []
      });
    } else {
      // Creating new employee -> fetch next ID preview
      fetchNextId();
    }
  }, [isOpen, employee]);

  const fetchNextId = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/employees/next-id`);
      if (res.data?.success) {
        setNextEmployeeId(res.data.employeeId);
      }
    } catch (err) {
      console.warn('Could not preview next employee ID:', err);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Document Upload Handler (Cloudinary or local fallback)
  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Please choose a file to upload (PDF, JPG, PNG).');
      return;
    }

    setUploadingDoc(true);
    setUploadSuccess('');
    setErrorMsg('');

    try {
      const uploadData = new FormData();
      uploadData.append('file', selectedFile);

      const res = await axios.post(`${API_BASE_URL}/employees/upload-document`, uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.success) {
        const newDoc = {
          title: uploadTitle.trim() || selectedFile.name,
          category: uploadCategory,
          fileUrl: res.data.fileUrl,
          publicId: res.data.publicId || '',
          format: res.data.format || '',
          bytes: res.data.bytes || 0,
          expiryDate: uploadExpiryDate ? new Date(uploadExpiryDate) : null,
          notes: uploadNotes.trim(),
          uploadedAt: new Date()
        };

        // If editing existing employee, also persist to database immediately
        if (employee?._id) {
          await axios.post(`${API_BASE_URL}/employees/${employee._id}/documents`, newDoc);
        }

        setFormData(prev => ({
          ...prev,
          documents: [...prev.documents, newDoc]
        }));

        setSelectedFile(null);
        setUploadTitle('');
        setUploadExpiryDate('');
        setUploadNotes('');
        setUploadSuccess('Document successfully uploaded & attached!');
        setTimeout(() => setUploadSuccess(''), 4000);
      }
    } catch (err) {
      console.error('File upload failed:', err);
      alert(err.response?.data?.message || 'Failed to upload document. Please try again.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleRemoveDoc = async (index, docId) => {
    if (!window.confirm('Are you sure you want to remove this attached document?')) return;
    try {
      if (employee?._id && docId) {
        await axios.delete(`${API_BASE_URL}/employees/${employee._id}/documents/${docId}`);
      }
      setFormData(prev => ({
        ...prev,
        documents: prev.documents.filter((_, idx) => idx !== index)
      }));
    } catch (err) {
      alert('Failed to remove document.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    try {
      if (!formData.name.trim()) {
        throw new Error('Employee legal name is required.');
      }
      if (formData.dailyWage === '' || Number(formData.dailyWage) < 0) {
        throw new Error('Daily wage is required and must be a non-negative number.');
      }

      const payload = {
        ...formData,
        dailyWage: Number(formData.dailyWage),
        hourlyRate: formData.hourlyRate ? Number(formData.hourlyRate) : 0,
        normalHoursPerWeek: formData.normalHoursPerWeek ? Number(formData.normalHoursPerWeek) : 0,
        openingBalance: formData.openingBalance !== '' ? Number(formData.openingBalance) : 0,
        employeeId: employee ? employee.employeeId : (formData.employeeId || nextEmployeeId)
      };

      let res;
      if (employee?._id) {
        res = await axios.put(`${API_BASE_URL}/employees/${employee._id}`, payload);
      } else {
        res = await axios.post(`${API_BASE_URL}/employees`, payload);
      }

      if (res.data?.success) {
        if (onSaved) onSaved(res.data.employee);
        onClose();
      }
    } catch (err) {
      console.error('Error saving employee:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to save employee profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!employee?._id) {
      alert('Please save the employee first to generate their Joining Form PDF.');
      return;
    }
    try {
      const cleanName = (employee.name || 'Worker').replace(/[^a-zA-Z0-9_-]/g, '_');
      await downloadReportFile(
        `/employees/${employee._id}/joining-form/pdf`,
        {},
        `Employee_Joining_Form_${employee.employeeId}_${cleanName}.pdf`
      );
    } catch (err) {
      alert(err.message || 'Failed to download Joining Form PDF.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999, overflowY: 'auto', padding: '16px' }}>
      <div
        className="modal-card"
        style={{
          maxWidth: '880px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '12px'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            background: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} color="#38bdf8" />
              {employee ? `Edit Employee & Onboarding: ${employee.name}` : 'New Employee Joining Form (UK Onboarding)'}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              Confidential Personnel Record • Right-to-Work • Payroll & Banking • Cloudinary Document Store
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {employee?._id && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="btn btn-sm"
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Download official signed Employee Joining Form PDF"
              >
                <Download size={13} /> Download Joining PDF
              </button>
            )}
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            padding: '0 16px',
            overflowX: 'auto',
            flexShrink: 0
          }}
        >
          {[
            { id: 'personal', label: '1. Personal Details', icon: User },
            { id: 'role', label: '2. Role & Workplace', icon: Building2 },
            { id: 'payroll', label: '3. Payroll & Bank', icon: Banknote },
            { id: 'right_to_work', label: '4. Right to Work & Visa', icon: ShieldCheck },
            { id: 'documents', label: `5. Documents (${formData.documents.length})`, icon: FileText }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '3px solid #2563eb' : '3px solid transparent',
                  color: isActive ? '#2563eb' : '#64748b',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {errorMsg && (
              <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                {errorMsg}
              </div>
            )}

            {/* TAB 1: PERSONAL DETAILS */}
            {activeTab === 'personal' && (
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={16} color="#2563eb" /> Personal Information & Emergency Contact
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Full Legal Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.name}
                      onChange={e => handleInputChange('name', e.target.value)}
                      placeholder="e.g. Muhammad Sarfraz"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Preferred Name / Known As</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.preferredName}
                      onChange={e => handleInputChange('preferredName', e.target.value)}
                      placeholder="e.g. Sarfraz"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Date of Birth</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.dateOfBirth}
                      onChange={e => handleInputChange('dateOfBirth', e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">National Insurance Number (NINO)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.nationalInsuranceNumber}
                      onChange={e => handleInputChange('nationalInsuranceNumber', e.target.value.toUpperCase())}
                      placeholder="e.g. QQ 12 34 56 C"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Mobile Telephone *</label>
                    <input
                      type="tel"
                      className="form-input"
                      value={formData.phone}
                      onChange={e => handleInputChange('phone', e.target.value)}
                      placeholder="e.g. 07123456789"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Personal Email</label>
                    <input
                      type="email"
                      className="form-input"
                      value={formData.email}
                      onChange={e => handleInputChange('email', e.target.value)}
                      placeholder="e.g. worker@example.com"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Home Residential Address</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.homeAddress}
                      onChange={e => handleInputChange('homeAddress', e.target.value)}
                      placeholder="Full street address in UK"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">UK Postcode</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.postcode}
                      onChange={e => handleInputChange('postcode', e.target.value.toUpperCase())}
                      placeholder="e.g. NW1 7JE"
                    />
                  </div>
                </div>

                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>
                    🚨 Emergency Contact (Next of Kin)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                    <div className="form-group">
                      <label className="form-label">Contact Name</label>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.emergencyContactName}
                        onChange={e => handleInputChange('emergencyContactName', e.target.value)}
                        placeholder="e.g. Aisha Khan"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Relationship</label>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.emergencyContactRelationship}
                        onChange={e => handleInputChange('emergencyContactRelationship', e.target.value)}
                        placeholder="e.g. Spouse / Sibling / Parent"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Emergency Phone</label>
                      <input
                        type="tel"
                        className="form-input"
                        value={formData.emergencyContactPhone}
                        onChange={e => handleInputChange('emergencyContactPhone', e.target.value)}
                        placeholder="e.g. 07987654321"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ROLE & WORKPLACE */}
            {activeTab === 'role' && (
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={16} color="#2563eb" /> Company, Role & Pay Arrangements
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Employee ID (System Automatic)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={employee ? employee.employeeId : (nextEmployeeId || 'Auto-generated')}
                      readOnly
                      style={{ background: '#f1f5f9', fontWeight: 700, color: '#0f172a' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Primary Assigned Shop / Workplace</label>
                    <select
                      className="form-select"
                      value={formData.assignedShop}
                      onChange={e => handleInputChange('assignedShop', e.target.value)}
                    >
                      <option value="">-- Multi-Site London (Unassigned) --</option>
                      {shops.map(s => (
                        <option key={s._id} value={s._id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Job Title / Duties</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.jobTitle}
                      onChange={e => handleInputChange('jobTitle', e.target.value)}
                      placeholder="e.g. Retail Assistant / Sales"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Employment Type</label>
                    <select
                      className="form-select"
                      value={formData.employmentType}
                      onChange={e => handleInputChange('employmentType', e.target.value)}
                    >
                      <option value="Casual / Zero-Hours">Casual / Zero-Hours (Multi-Site)</option>
                      <option value="Permanent">Permanent</option>
                      <option value="Fixed Term">Fixed Term</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Employment Start Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.startDate}
                      onChange={e => handleInputChange('startDate', e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Line Manager</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.lineManager}
                      onChange={e => handleInputChange('lineManager', e.target.value)}
                      placeholder="e.g. Fahad Rasheed"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Daily Wage (£) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-input"
                      value={formData.dailyWage}
                      onChange={e => handleInputChange('dailyWage', e.target.value)}
                      placeholder="e.g. 50.00"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Hourly Rate (£, Optional)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-input"
                      value={formData.hourlyRate}
                      onChange={e => handleInputChange('hourlyRate', e.target.value)}
                      placeholder="e.g. 11.44"
                    />
                  </div>
                </div>

                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>
                    💼 Opening Balance & Notes
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div className="form-group">
                      <label className="form-label">Opening Balance (£, Previous Unpaid/Owed)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        value={formData.openingBalance}
                        onChange={e => handleInputChange('openingBalance', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Opening Balance Note</label>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.openingBalanceNote}
                        onChange={e => handleInputChange('openingBalanceNote', e.target.value)}
                        placeholder="e.g. Carried forward balance"
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '10px' }}>
                    <label className="form-label">General Administrative Notes</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      value={formData.notes}
                      onChange={e => handleInputChange('notes', e.target.value)}
                      placeholder="Any specific comments, rota availability, or compliance notes"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PAYROLL & BANKING */}
            {activeTab === 'payroll' && (
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Banknote size={16} color="#2563eb" /> Payroll Details & Bank Account (BACS)
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Bank Account Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.bankAccountName}
                      onChange={e => handleInputChange('bankAccountName', e.target.value)}
                      placeholder="e.g. M Sarfraz"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Bank Sort Code (6 digits)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.bankSortCode}
                      onChange={e => handleInputChange('bankSortCode', e.target.value)}
                      placeholder="e.g. 20-45-78"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Bank Account Number (8 digits)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.bankAccountNumber}
                      onChange={e => handleInputChange('bankAccountNumber', e.target.value)}
                      placeholder="e.g. 12345678"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">HMRC Starter Checklist / P45 Status</label>
                    <select
                      className="form-select"
                      value={formData.p45Status}
                      onChange={e => handleInputChange('p45Status', e.target.value)}
                    >
                      <option value="Pending">Pending (Not yet submitted)</option>
                      <option value="P45 Received">P45 Received & Recorded</option>
                      <option value="Starter Checklist Completed">HMRC Starter Checklist Completed</option>
                      <option value="Not Applicable">Not Applicable</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: '16px', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b' }}>
                  ℹ️ Bank transfer details are verified for Arsalan's payout schedule and weekly salary disbursement ledger.
                </div>
              </div>
            )}

            {/* TAB 4: RIGHT TO WORK & VISA */}
            {activeTab === 'right_to_work' && (
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={16} color="#16a34a" /> Home Office Right-to-Work & Immigration Compliance
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Check Method</label>
                    <select
                      className="form-select"
                      value={formData.rightToWorkCheckMethod}
                      onChange={e => handleInputChange('rightToWorkCheckMethod', e.target.value)}
                    >
                      <option value="Manual eligible documents">Manual eligible documents (Passport/BRP)</option>
                      <option value="Home Office online share code">Home Office online share code</option>
                      <option value="Approved digital IDVT">Approved digital IDVT / IDSP</option>
                      <option value="Employer Checking Service (ECS)">Employer Checking Service (ECS)</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Nationality / Immigration Status</label>
                    <select
                      className="form-select"
                      value={formData.nationalityType}
                      onChange={e => handleInputChange('nationalityType', e.target.value)}
                    >
                      <option value="British / Irish Citizen">British / Irish Citizen</option>
                      <option value="Settled / Pre-Settled">EU Settled / Pre-Settled Status</option>
                      <option value="Student Visa">Student Visa (Time-limited)</option>
                      <option value="Skilled Worker / Sponsored">Skilled Worker / Sponsored</option>
                      <option value="Graduate / Other Migrant Worker">Graduate / Other Migrant Worker</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Evidence / Share Code Reference</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.rightToWorkReference}
                      onChange={e => handleInputChange('rightToWorkReference', e.target.value)}
                      placeholder="e.g. W9X-76P-2KL or Passport Number"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Date Check Completed</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.rightToWorkCheckDate}
                      onChange={e => handleInputChange('rightToWorkCheckDate', e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Compliance Status</label>
                    <select
                      className="form-select"
                      value={formData.rightToWorkStatus}
                      onChange={e => handleInputChange('rightToWorkStatus', e.target.value)}
                    >
                      <option value="Passed">Passed (Approved to work)</option>
                      <option value="Pending - DO NOT START">Pending - DO NOT START</option>
                      <option value="Escalate for advice">Escalate for advice</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Checking Manager</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.checkerName}
                      onChange={e => handleInputChange('checkerName', e.target.value)}
                      placeholder="e.g. Fahad Rasheed"
                    />
                  </div>

                  {/* EXPIRY DATES - TRIGGERS 1 MONTH & 1 WEEK SCREEN ALERTS */}
                  <div className="form-group" style={{ background: '#fef3c7', padding: '10px', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                    <label className="form-label" style={{ fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertTriangle size={14} color="#d97706" /> Right to Work / Visa Expiry Date
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.visaExpiryDate}
                      onChange={e => handleInputChange('visaExpiryDate', e.target.value)}
                    />
                    <div style={{ fontSize: '11px', color: '#78350f', marginTop: '4px' }}>
                      ⚡ Triggers on-screen alert 1 month before and 1 week before expiry.
                    </div>
                  </div>

                  <div className="form-group" style={{ background: '#fef3c7', padding: '10px', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                    <label className="form-label" style={{ fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertTriangle size={14} color="#d97706" /> Passport Expiry Date
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.passportExpiryDate}
                      onChange={e => handleInputChange('passportExpiryDate', e.target.value)}
                    />
                    <div style={{ fontSize: '11px', color: '#78350f', marginTop: '4px' }}>
                      ⚡ Triggers on-screen alert 1 month before and 1 week before expiry.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Visa Conditions / Hours Restrictions</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.visaConditions}
                      onChange={e => handleInputChange('visaConditions', e.target.value)}
                      placeholder="e.g. Max 20 hours/week term time"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Certificate of Sponsorship (CoS) Ref (If Sponsored)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.cosReference}
                      onChange={e => handleInputChange('cosReference', e.target.value)}
                      placeholder="e.g. WBS123456789"
                    />
                  </div>
                </div>

                <div style={{ marginTop: '14px', padding: '12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                    <input
                      type="checkbox"
                      checked={formData.healthSafetyInductionCompleted}
                      onChange={e => handleInputChange('healthSafetyInductionCompleted', e.target.checked)}
                      style={{ width: '16px', height: '16px' }}
                    />
                    First-day Health & Safety induction, store security, and emergency procedures explained and completed
                  </label>
                </div>
              </div>
            )}

            {/* TAB 5: DOCUMENTS & CLOUDINARY UPLOADS */}
            {activeTab === 'documents' && (
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Upload size={16} color="#2563eb" /> Cloudinary Document Store & Expiry Records
                </h3>

                {/* Upload Form Box */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1.5px dashed #cbd5e1',
                    marginBottom: '20px'
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '10px' }}>
                    Upload New Compliance Document (Cloudinary Secure Storage)
                  </div>

                  {uploadSuccess && (
                    <div style={{ padding: '8px 12px', background: '#dcfce7', color: '#166534', borderRadius: '6px', fontSize: '12px', marginBottom: '12px' }}>
                      ✓ {uploadSuccess}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Document Category</label>
                      <select
                        className="form-select"
                        value={uploadCategory}
                        onChange={e => setUploadCategory(e.target.value)}
                      >
                        <option value="Proof of Right to Work">Proof of Right to Work</option>
                        <option value="Passport">Passport</option>
                        <option value="Home Office Online Share Code">Home Office Online Share Code Result</option>
                        <option value="P45 or Starter Checklist">P45 or HMRC Starter Checklist</option>
                        <option value="Signed Employment Contract">Signed Employment Contract</option>
                        <option value="National Insurance Document">National Insurance Document</option>
                        <option value="Proof of Address / Bank Details">Proof of Address / Bank Details</option>
                        <option value="DBS / Certificates">DBS / Certificates</option>
                        <option value="Health & Safety Induction">Health & Safety Induction Record</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Document Title / Reference</label>
                      <input
                        type="text"
                        className="form-input"
                        value={uploadTitle}
                        onChange={e => setUploadTitle(e.target.value)}
                        placeholder="e.g. Valid BRP Card Front & Back"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Document Expiry Date (If applicable)</label>
                      <input
                        type="date"
                        className="form-input"
                        value={uploadExpiryDate}
                        onChange={e => setUploadExpiryDate(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Select File (PDF, PNG, JPG)</label>
                      <input
                        type="file"
                        className="form-input"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        onChange={e => setSelectedFile(e.target.files[0])}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button
                      type="button"
                      onClick={handleFileUpload}
                      disabled={uploadingDoc || !selectedFile}
                      className="btn btn-sm"
                      style={{
                        background: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        fontWeight: 600,
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {uploadingDoc ? <RefreshCw size={13} className="spin" /> : <Upload size={13} />}
                      {uploadingDoc ? 'Uploading to Cloudinary...' : 'Upload & Attach Document'}
                    </button>
                  </div>
                </div>

                {/* Attached Documents List */}
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
                    Attached Documents ({formData.documents.length})
                  </h4>

                  {formData.documents.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                      No documents attached yet. Choose a file above and click Upload to store in Cloudinary.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {formData.documents.map((doc, idx) => (
                        <div
                          key={doc._id || idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            background: '#ffffff',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FileText size={18} color="#2563eb" />
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                                {doc.title}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                <span style={{ fontWeight: 600, color: '#0284c7' }}>{doc.category}</span>
                                {doc.expiryDate && (
                                  <> • Expiry: <strong style={{ color: '#d97706' }}>{String(doc.expiryDate).slice(0, 10)}</strong></>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <a
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-outline btn-sm"
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px' }}
                            >
                              <ExternalLink size={12} /> View File
                            </a>
                            <button
                              type="button"
                              onClick={() => handleRemoveDoc(idx, doc._id)}
                              style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '4px' }}
                              title="Delete document"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div
            style={{
              padding: '14px 22px',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}
          >
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              All UK employment & Right-to-Work compliance records are retained securely.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-outline btn-sm"
                style={{ padding: '7px 14px' }}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary btn-sm"
                style={{ padding: '7px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {submitting ? <RefreshCw size={14} className="spin" /> : <CheckCircle2 size={14} />}
                {submitting ? 'Saving...' : employee ? 'Update Employee & Onboarding' : 'Save & Onboard Employee'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
