import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { downloadReportFile } from '../utils/downloadReportFile';
import { formatTime12Hour } from '../utils/formatTime';
import {
  ArrowLeft, Download, Banknote, Clock, Award, ShieldAlert,
  FileText, Trash2, Edit, ExternalLink, ShieldCheck, CheckCircle2,
  AlertTriangle, Building2, User, Plus, X, Landmark, HandCoins
} from 'lucide-react';
import EmployeeJoiningModal from '../components/EmployeeJoiningModal';

function getApiFailureMessage(error, fallback) {
  if (!error.response) {
    return `Cannot connect to ${API_BASE_URL}. Make sure the backend is running and reachable.`;
  }
  return error.response.data?.message || fallback;
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Joining modal & shops
  const [joiningModalOpen, setJoiningModalOpen] = useState(false);
  const [joiningModalTab, setJoiningModalTab] = useState('personal');
  const [downloadingJoiningPdf, setDownloadingJoiningPdf] = useState(false);
  const [shops, setShops] = useState([]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/shops`).then(res => {
      if (res.data?.success) setShops(res.data.shops || []);
    }).catch(err => console.warn('Could not load shops:', err.message));
  }, []);

  const handleDeleteWorker = async () => {
    if (!profile?.employee) return;
    const emp = profile.employee;
    if (!window.confirm(`Are you sure you want to permanently delete worker ${emp.name} (${emp.employeeId})?\n\nThis will remove the worker and all associated records. This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await axios.delete(`${API_BASE_URL}/employees/${emp._id}`);
      if (res.data.success) {
        alert(res.data.message || `Worker ${emp.name} deleted successfully.`);
        navigate('/employees');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete worker');
    }
  };

  // Monthly Report State (Matching Image 2) - Defaults to current active month
  const [reportMonth, setReportMonth] = useState(String(new Date().getMonth() + 1));
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [monthlyReportData, setMonthlyReportData] = useState(null);
  const [monthlyReportError, setMonthlyReportError] = useState('');
  const [downloadingMonthlyExcel, setDownloadingMonthlyExcel] = useState(false);
  const [activeTab, setActiveTab] = useState('monthly_report'); // 'monthly_report', 'ledger', 'loan_ledger', 'attendance', 'salaries'

  // Worker Loan & Advances State
  const [loansData, setLoansData] = useState({ loans: [], totalBorrowed: 0, totalRepaid: 0, remainingBalance: 0, ledgerEvents: [] });
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [giveLoanModalOpen, setGiveLoanModalOpen] = useState(false);
  const [giveLoanAmount, setGiveLoanAmount] = useState('');
  const [giveLoanDate, setGiveLoanDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [giveLoanReason, setGiveLoanReason] = useState('Personal Advance / Loan');
  const [giveLoanNotes, setGiveLoanNotes] = useState('');
  const [givingLoan, setGivingLoan] = useState(false);

  // Direct Repayment Modal State
  const [repayModalOpen, setRepayModalOpen] = useState(false);
  const [repayTargetLoan, setRepayTargetLoan] = useState(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayDate, setRepayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [repayMethod, setRepayMethod] = useState('Cash');
  const [repayNotes, setRepayNotes] = useState('');
  const [recordingRepay, setRecordingRepay] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchMonthlyReport();
    fetchEmployeeLoans();
  }, [id, reportMonth, reportYear]);

  const [error, setError] = useState('');

  const fetchProfile = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/employees/${id}/profile`);
      if (res.data.success) {
        setProfile(res.data);
      }
    } catch (err) {
      console.error(err);
      setError(getApiFailureMessage(err, 'Unable to load employee profile. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthlyReport = async () => {
    setMonthlyReportError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/reports/employee-monthly`, {
        params: { employeeId: id, month: reportMonth, year: reportYear }
      });
      if (res.data.success) {
        setMonthlyReportData(res.data);
      }
    } catch (err) {
      setMonthlyReportError(getApiFailureMessage(err, 'Unable to load this monthly report.'));
    }
  };

  const fetchEmployeeLoans = async () => {
    setLoadingLoans(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/loans/employee/${id}`);
      if (res.data.success) {
        setLoansData(res.data);
      }
    } catch (err) {
      console.warn('Failed to load employee loans:', err.message);
    } finally {
      setLoadingLoans(false);
    }
  };

  const handleCreateLoan = async (e) => {
    e.preventDefault();
    const amount = Number(giveLoanAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid loan amount greater than £0.');
      return;
    }
    setGivingLoan(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/loans`, {
        employeeId: id,
        amount,
        issueDate: giveLoanDate,
        reason: giveLoanReason,
        notes: giveLoanNotes
      });
      if (res.data.success) {
        setGiveLoanModalOpen(false);
        setGiveLoanAmount('');
        setGiveLoanNotes('');
        await fetchEmployeeLoans();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create loan.');
    } finally {
      setGivingLoan(false);
    }
  };

  const handleRecordRepayment = async (e) => {
    e.preventDefault();
    if (!repayTargetLoan) return;
    const amount = Number(repayAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid repayment amount greater than £0.');
      return;
    }
    setRecordingRepay(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/loans/${repayTargetLoan._id}/repay`, {
        amount,
        repaymentDate: repayDate,
        repaymentMethod: repayMethod,
        notes: repayNotes
      });
      if (res.data.success) {
        setRepayModalOpen(false);
        setRepayTargetLoan(null);
        setRepayAmount('');
        setRepayNotes('');
        await fetchEmployeeLoans();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record repayment.');
    } finally {
      setRecordingRepay(false);
    }
  };

  const handleDeleteLoan = async (loanId) => {
    if (!window.confirm('Are you sure you want to delete this loan record?')) return;
    try {
      const res = await axios.delete(`${API_BASE_URL}/loans/${loanId}`);
      if (res.data.success) {
        await fetchEmployeeLoans();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete loan.');
    }
  };

  const [downloadingMonthlyPdf, setDownloadingMonthlyPdf] = useState(false);

  const downloadMonthlyExcel = async () => {
    setDownloadingMonthlyExcel(true);
    try {
      await downloadReportFile(
        '/reports/employee-monthly/excel',
        { employeeId: id, month: reportMonth, year: reportYear },
        `Employee_Monthly_${reportYear}-${String(reportMonth).padStart(2, '0')}.xlsx`
      );
    } catch (err) {
      window.alert(err.message || 'Unable to download monthly Excel report.');
    } finally {
      setDownloadingMonthlyExcel(false);
    }
  };

  const downloadMonthlyPdf = async () => {
    setDownloadingMonthlyPdf(true);
    try {
      await downloadReportFile(
        '/reports/employee-monthly/pdf',
        { employeeId: id, month: reportMonth, year: reportYear },
        `Employee_Monthly_${reportYear}-${String(reportMonth).padStart(2, '0')}.pdf`
      );
    } catch (err) {
      window.alert(err.message || 'Unable to download monthly PDF report.');
    } finally {
      setDownloadingMonthlyPdf(false);
    }
  };

  const [downloadingLedgerPdf, setDownloadingLedgerPdf] = useState(false);
  const [downloadingLedgerExcel, setDownloadingLedgerExcel] = useState(false);

  const downloadLedgerPdf = async () => {
    setDownloadingLedgerPdf(true);
    try {
      await downloadReportFile(
        `/reports/ledger/${id}/pdf`,
        {},
        `Ledger_${profile?.employee?.name ? profile.employee.name.replace(/\s+/g, '_') : id}.pdf`
      );
    } catch (err) {
      window.alert(err.message || 'Unable to download ledger PDF report.');
    } finally {
      setDownloadingLedgerPdf(false);
    }
  };

  const downloadLedgerExcel = async () => {
    setDownloadingLedgerExcel(true);
    try {
      await downloadReportFile(
        `/reports/ledger/${id}/excel`,
        {},
        `Ledger_${profile?.employee?.name ? profile.employee.name.replace(/\s+/g, '_') : id}.xlsx`
      );
    } catch (err) {
      window.alert(err.message || 'Unable to download ledger Excel report.');
    } finally {
      setDownloadingLedgerExcel(false);
    }
  };

  const downloadJoiningFormPdf = async () => {
    setDownloadingJoiningPdf(true);
    try {
      await downloadReportFile(
        `/employees/${id}/joining-form/pdf`,
        {},
        `Joining_Form_${profile?.employee?.name ? profile.employee.name.replace(/\s+/g, '_') : id}.pdf`
      );
    } catch (err) {
      window.alert(err.message || 'Unable to download joining form PDF.');
    } finally {
      setDownloadingJoiningPdf(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this compliance document?')) return;
    try {
      const res = await axios.delete(`${API_BASE_URL}/employees/${id}/documents/${docId}`);
      if (res.data?.success) {
        alert('Document removed successfully');
        fetchProfile();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete document');
    }
  };

  const getExpiryPill = (dateStr) => {
    if (!dateStr) return { label: 'Not Specified', color: '#64748b', bg: '#f1f5f9', isAlert: false };
    const exp = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const formatted = exp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (diffDays <= 0) {
      return { label: `${formatted} (EXPIRED ${Math.abs(diffDays)}d ago)`, color: '#b91c1c', bg: '#fee2e2', isAlert: true, urgent: true };
    }
    if (diffDays <= 7) {
      return { label: `${formatted} (URGENT: ${diffDays}d left - 1 Week)`, color: '#c2410c', bg: '#ffedd5', isAlert: true, urgent: true };
    }
    if (diffDays <= 30) {
      return { label: `${formatted} (NOTICE: ${diffDays}d left - 1 Month)`, color: '#b45309', bg: '#fef3c7', isAlert: true, urgent: false };
    }
    return { label: `${formatted} (${diffDays} days remaining)`, color: '#15803d', bg: '#dcfce7', isAlert: false };
  };

  if (loading && !profile) {
    return (
      <div className="page-container" aria-busy="true">
        <div style={{ marginBottom: '16px' }}>
          <div className="skeleton skeleton-text" style={{ width: '140px', height: '30px' }}></div>
        </div>
        <div className="skeleton skeleton-card" style={{ height: '110px', marginBottom: '24px' }}></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div className="skeleton skeleton-card" style={{ height: '90px' }}></div>
          <div className="skeleton skeleton-card" style={{ height: '90px' }}></div>
          <div className="skeleton skeleton-card" style={{ height: '90px' }}></div>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="page-container">
        <div className="error-state">
          <div className="error-state-title">Profile Unavailable</div>
          <div className="error-state-desc">{error}</div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <Link to="/employees" className="btn btn-outline btn-sm">
              Back to Directory
            </Link>
            <button className="btn btn-primary btn-sm" onClick={fetchProfile}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { employee, summary = {}, attendances = [], salaries = [], ledger = [] } = profile;

  const ledgerTotalEarned = ledger.reduce((sum, t) => sum + (t.amountEarned || 0), 0);
  const ledgerTotalPaid = ledger.reduce((sum, t) => sum + (t.amountPaid || 0), 0);
  const ledgerOutstanding = ledger.length > 0
    ? (ledger[ledger.length - 1].runningBalance ?? (ledgerTotalEarned - ledgerTotalPaid))
    : (employee?.openingBalance || 0);

  const getLedgerBadgeStyle = (type) => {
    switch (type) {
      case 'OPENING_BALANCE':
        return { background: '#ede9fe', color: '#7c3aed', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block' };
      case 'BONUS_CREDIT':
        return { background: '#ccfbf1', color: '#0f766e', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block' };
      case 'SALARY_EARNED':
        return { background: '#dbeafe', color: '#1d4ed8', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block' };
      case 'SALARY_PAYMENT':
        return { background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block' };
      case 'DEDUCTION':
        return { background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block' };
      case 'WAGE_INCREASE':
        return { background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block' };
      default:
        return { background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block' };
    }
  };

  return (
    <div className="page-container">
      {/* Back button & Title */}
      <div style={{ marginBottom: '16px' }}>
        <Link to="/employees" className="btn btn-outline btn-sm" style={{ display: 'inline-flex', gap: '6px' }}>
          <ArrowLeft size={14} /> Back to Staff Directory
        </Link>
      </div>

      {/* Header Profile Card */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>
                {employee.name}
              </h1>
              <span className={`badge badge-${employee.employmentStatus === 'Active' ? 'present' : 'absent'}`}>
                {employee.employmentStatus}
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
              ID: <strong>{employee.employeeId}</strong> • Daily Wage: <strong>£{Number(employee.dailyWage || 0).toFixed(2)}</strong>
              {employee.jobTitle ? <> • Role: <strong>{employee.jobTitle}</strong></> : null}
              {employee.workLocation ? <> • Location: <strong>{employee.workLocation}</strong></> : null}
              {employee.openingBalance !== undefined && employee.openingBalance !== 0 && (
                <> • Opening Balance: <strong style={{ color: '#7c3aed' }}>£{Number(employee.openingBalance).toFixed(2)}</strong></>
              )}
              {employee.email ? <> • Email: <strong>{employee.email}</strong></> : null}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { setJoiningModalTab('personal'); setJoiningModalOpen(true); }}
              title="Edit Employee Joining Form, Right to Work & Documents"
            >
              <Edit size={14} /> Edit Joining Form
            </button>
            <button className="btn btn-outline btn-sm" onClick={downloadJoiningFormPdf} disabled={downloadingJoiningPdf} title="Download Complete UK Joining Form PDF">
              <FileText size={14} color="#2563eb" /> {downloadingJoiningPdf ? 'Generating PDF...' : 'Download Joining PDF'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={downloadMonthlyPdf} disabled={downloadingMonthlyPdf}>
              <FileText size={14} color="#dc2626" /> {downloadingMonthlyPdf ? 'Preparing PDF...' : 'Export Monthly PDF'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={downloadMonthlyExcel} disabled={downloadingMonthlyExcel}>
              <Download size={14} /> {downloadingMonthlyExcel ? 'Preparing Excel...' : 'Export Monthly Excel'}
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{ color: '#dc2626', borderColor: '#fca5a5' }}
              onClick={handleDeleteWorker}
              title="Delete Worker Permanently"
            >
              <Trash2 size={14} /> Delete Worker
            </button>
          </div>
        </div>
      </div>

      {/* Earnings Summary: This Week / This Month / This Year (Section 38) */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
          Real-Time Earnings Summary
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {/* This Week */}
          <div className="card">
            <div className="stat-lbl" style={{ color: '#2563eb' }}>THIS WEEK</div>
            <div style={{ marginTop: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Working Days / Hours:</span>
                <strong>{summary.thisWeek?.workingDays || 0}d / {summary.thisWeek?.hours || 0}h</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Gross Wages:</span>
                <strong>£{summary.thisWeek?.gross?.toFixed(2) || '0.00'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Deductions:</span>
                <span style={{ color: '#dc2626' }}>-£{summary.thisWeek?.deductions?.toFixed(2) || '0.00'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Allowances & Bonus:</span>
                <span style={{ color: '#10b981' }}>+£{((summary.thisWeek?.allowances || 0) + (summary.thisWeek?.bonus || 0)).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                <span style={{ fontWeight: 600 }}>Final Salary:</span>
                <strong style={{ color: '#2563eb', fontSize: '15px' }}>£{summary.thisWeek?.total?.toFixed(2) || '0.00'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '12px' }}>
                <span style={{ color: '#64748b' }}>Paid / Outstanding:</span>
                <span>£{summary.thisWeek?.paid?.toFixed(2) || '0.00'} / <strong style={{ color: '#d97706' }}>£{summary.thisWeek?.outstanding?.toFixed(2) || '0.00'}</strong></span>
              </div>
            </div>
          </div>

          {/* This Month */}
          <div className="card">
            <div className="stat-lbl" style={{ color: '#059669' }}>THIS MONTH</div>
            <div style={{ marginTop: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Working Days / Hours:</span>
                <strong>{summary.thisMonth?.workingDays || 0}d / {summary.thisMonth?.hours || 0}h</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Gross Wages:</span>
                <strong>£{summary.thisMonth?.gross?.toFixed(2) || '0.00'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Deductions:</span>
                <span style={{ color: '#dc2626' }}>-£{summary.thisMonth?.deductions?.toFixed(2) || '0.00'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Allowances & Bonus:</span>
                <span style={{ color: '#10b981' }}>+£{((summary.thisMonth?.allowances || 0) + (summary.thisMonth?.bonus || 0)).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                <span style={{ fontWeight: 600 }}>Month Total:</span>
                <strong style={{ color: '#059669', fontSize: '15px' }}>£{summary.thisMonth?.total?.toFixed(2) || '0.00'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '12px' }}>
                <span style={{ color: '#64748b' }}>Paid / Outstanding:</span>
                <span>£{summary.thisMonth?.paid?.toFixed(2) || '0.00'} / <strong style={{ color: '#d97706' }}>£{summary.thisMonth?.outstanding?.toFixed(2) || '0.00'}</strong></span>
              </div>
            </div>
          </div>

          {/* This Year */}
          <div className="card">
            <div className="stat-lbl" style={{ color: '#7c3aed' }}>THIS YEAR</div>
            <div style={{ marginTop: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Working Days / Hours:</span>
                <strong>{summary.thisYear?.workingDays || 0}d / {summary.thisYear?.hours || 0}h</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Total Gross Wages:</span>
                <strong>£{summary.thisYear?.gross?.toFixed(2) || '0.00'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Total Deductions:</span>
                <span style={{ color: '#dc2626' }}>-£{summary.thisYear?.deductions?.toFixed(2) || '0.00'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Total Allowances/Bonus:</span>
                <span style={{ color: '#10b981' }}>+£{((summary.thisYear?.allowances || 0) + (summary.thisYear?.bonus || 0)).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                <span style={{ fontWeight: 600 }}>Year Cumulative:</span>
                <strong style={{ color: '#7c3aed', fontSize: '15px' }}>£{summary.thisYear?.total?.toFixed(2) || '0.00'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '12px' }}>
                <span style={{ color: '#64748b' }}>Paid / Outstanding:</span>
                <span>£{summary.thisYear?.paid?.toFixed(2) || '0.00'} / <strong style={{ color: '#d97706' }}>£{summary.thisYear?.outstanding?.toFixed(2) || '0.00'}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Expiry Warning Banner for this Employee */}
      {(() => {
        const visaPill = getExpiryPill(employee?.visaExpiryDate);
        const passPill = getExpiryPill(employee?.passportExpiryDate);
        const docAlerts = (employee?.documents || []).filter(d => d.expiryDate && getExpiryPill(d.expiryDate).isAlert);
        const hasAlert = visaPill.isAlert || passPill.isAlert || docAlerts.length > 0;

        if (!hasAlert) return null;

        return (
          <div
            style={{
              background: '#fef2f2',
              border: '1.5px solid #f87171',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldAlert size={20} color="#dc2626" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#991b1b' }}>
                  Compliance Notice: Expiring or Expired Right to Work Documents
                </div>
                <div style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '2px' }}>
                  {visaPill.isAlert && <span>Visa: <strong>{visaPill.label}</strong>. </span>}
                  {passPill.isAlert && <span>Passport: <strong>{passPill.label}</strong>. </span>}
                  {docAlerts.length > 0 && <span>{docAlerts.length} uploaded document(s) need renewal.</span>}
                </div>
              </div>
            </div>

            <button
              className="btn btn-sm"
              style={{ background: '#dc2626', color: '#ffffff', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={() => { setJoiningModalTab('right_to_work'); setJoiningModalOpen(true); }}
            >
              <Edit size={13} /> Update Expiry & Documents
            </button>
          </div>
        );
      })()}

      {/* Tabs navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'joining_record' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('joining_record')}
        >
          📋 Joining & Right-to-Work Compliance
        </button>
        <button
          className={`btn ${activeTab === 'monthly_report' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('monthly_report')}
        >
          📄 Monthly Statement (Spreadsheet View)
        </button>
        <button
          className={`btn ${activeTab === 'ledger' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('ledger')}
        >
          📒 Accounting Ledger
        </button>
        <button
          className={`btn ${activeTab === 'loan_ledger' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => { setActiveTab('loan_ledger'); fetchEmployeeLoans(); }}
        >
          💳 Worker Loan Ledger
          {Number(loansData.remainingBalance || 0) > 0 && (
            <span style={{ marginLeft: '6px', background: '#dc2626', color: '#ffffff', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 800 }}>
              £{Number(loansData.remainingBalance).toFixed(2)}
            </span>
          )}
        </button>
        <button
          className={`btn ${activeTab === 'attendance' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('attendance')}
        >
          ⏱️ Attendance History
        </button>
        <button
          className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('history')}
        >
          📜 Wage History
        </button>
      </div>

      {/* TAB 0: Unified Joining Record & Right-to-Work Compliance */}
      {activeTab === 'joining_record' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Action Toolbar */}
          <div className="card" style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                UK Employee Onboarding & Compliance Record
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Official personnel record containing employment contract details, right-to-work verification, banking, and Cloudinary documents
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setJoiningModalTab('personal'); setJoiningModalOpen(true); }}
              >
                <Edit size={13} /> Edit Joining Form
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={downloadJoiningFormPdf}
                disabled={downloadingJoiningPdf}
              >
                <FileText size={13} color="#2563eb" /> {downloadingJoiningPdf ? 'Generating PDF...' : 'Download Official PDF'}
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => { setJoiningModalTab('documents'); setJoiningModalOpen(true); }}
              >
                <ExternalLink size={13} /> Upload Documents (Cloudinary)
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
            {/* Card 1: Company & Workplace Details */}
            <div className="card">
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                <Building2 size={16} color="#2563eb" /> Company & Role Details
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Employer Legal Name:</span>
                  <strong>{employee.companyLegalName || 'Pixx Technologies Ltd'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Trading / Brand Name:</span>
                  <strong>{employee.tradingName || 'Pixx Retail London'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Job Title:</span>
                  <strong>{employee.jobTitle || 'Retail Assistant / Sales'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Work Location:</span>
                  <strong>{employee.workLocation || (employee.assignedShop?.name || 'Pixx Retail')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Employment Type:</span>
                  <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                    {employee.employmentType || 'Casual / Zero-Hours'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Start Date:</span>
                  <strong>{employee.startDate ? new Date(employee.startDate).toLocaleDateString('en-GB') : '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Daily Wage Rate:</span>
                  <strong style={{ color: '#059669', fontSize: '14px' }}>£{Number(employee.dailyWage || 0).toFixed(2)}</strong>
                </div>
                {employee.hourlyRate && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>Equivalent Hourly Rate:</span>
                    <strong>£{Number(employee.hourlyRate).toFixed(2)}/hr</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Normal Hours / Week:</span>
                  <strong>{employee.normalHoursPerWeek ? `${employee.normalHoursPerWeek} hrs/week` : 'Variable / Rota'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Line Manager:</span>
                  <strong>{employee.lineManager || 'Fahad Rasheed'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: '#64748b' }}>H&S Induction:</span>
                  <span style={{ color: employee.healthSafetyInductionCompleted ? '#16a34a' : '#ea580c', fontWeight: 600 }}>
                    {employee.healthSafetyInductionCompleted ? '✅ Completed' : '⚠️ Pending Induction'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Personal Details & Emergency Contact */}
            <div className="card">
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                <User size={16} color="#2563eb" /> Personal Details & Emergency Contact
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Full Legal Name:</span>
                  <strong>{employee.name}</strong>
                </div>
                {employee.preferredName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>Preferred Name:</span>
                    <strong>{employee.preferredName}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Date of Birth:</span>
                  <strong>{employee.dateOfBirth ? new Date(employee.dateOfBirth).toLocaleDateString('en-GB') : '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>National Insurance No:</span>
                  <strong style={{ letterSpacing: '1px' }}>{employee.nationalInsuranceNumber || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Phone Number:</span>
                  <strong>{employee.phone || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Email Address:</span>
                  <strong>{employee.email || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Residential Address:</span>
                  <strong style={{ textAlign: 'right', maxWidth: '60%' }}>{employee.homeAddress || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Postcode:</span>
                  <strong>{employee.postcode || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Emergency Contact Name:</span>
                  <strong>{employee.emergencyContactName || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: '#64748b' }}>Emergency Phone / Rel:</span>
                  <strong>
                    {employee.emergencyContactPhone || '—'} {employee.emergencyContactRelationship ? `(${employee.emergencyContactRelationship})` : ''}
                  </strong>
                </div>
              </div>
            </div>

            {/* Card 3: Banking & Payroll Details */}
            <div className="card">
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                <Banknote size={16} color="#059669" /> Payroll & UK Banking Details
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Bank Account Name:</span>
                  <strong>{employee.bankAccountName || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Bank Sort Code:</span>
                  <strong style={{ letterSpacing: '1px' }}>{employee.bankSortCode || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Bank Account Number:</span>
                  <strong style={{ letterSpacing: '1px' }}>
                    {employee.bankAccountNumber ? `•••• •••• ${employee.bankAccountNumber.slice(-4)}` : '—'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>P45 Status:</span>
                  <span className="badge" style={{ background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1' }}>
                    {employee.p45Status || 'Pending'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Opening Balance:</span>
                  <strong style={{ color: (employee.openingBalance || 0) !== 0 ? '#7c3aed' : '#94a3b8' }}>
                    £{Number(employee.openingBalance || 0).toFixed(2)}
                  </strong>
                </div>
                {employee.openingBalanceNote && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ color: '#64748b' }}>Opening Note:</span>
                    <span style={{ color: '#64748b', fontSize: '12px' }}>{employee.openingBalanceNote}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Card 4: Right to Work & Visa Compliance */}
            <div className="card">
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                <ShieldCheck size={16} color="#0284c7" /> Right to Work & Visa Verification
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Nationality / Status:</span>
                  <strong>{employee.nationalityType || 'British / Irish Citizen'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Check Method:</span>
                  <strong>{employee.rightToWorkCheckMethod || 'Manual eligible documents'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Verification Status:</span>
                  <span className={`badge badge-${employee.rightToWorkStatus === 'Passed' ? 'present' : 'absent'}`}>
                    {employee.rightToWorkStatus || 'Passed'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Checked By:</span>
                  <strong>
                    {employee.checkerName || 'Fahad Rasheed'} {employee.rightToWorkCheckDate ? `(${new Date(employee.rightToWorkCheckDate).toLocaleDateString('en-GB')})` : ''}
                  </strong>
                </div>
                {employee.rightToWorkReference && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>Share Code / Ref:</span>
                    <strong style={{ letterSpacing: '1px' }}>{employee.rightToWorkReference}</strong>
                  </div>
                )}
                {employee.cosReference && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>CoS Reference:</span>
                    <strong>{employee.cosReference}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Visa Expiry Date:</span>
                  {(() => {
                    const pill = getExpiryPill(employee.visaExpiryDate);
                    return (
                      <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: pill.bg, color: pill.color }}>
                        {pill.label}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Passport Expiry Date:</span>
                  {(() => {
                    const pill = getExpiryPill(employee.passportExpiryDate);
                    return (
                      <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: pill.bg, color: pill.color }}>
                        {pill.label}
                      </span>
                    );
                  })()}
                </div>
                {employee.visaConditions && (
                  <div style={{ padding: '4px 0' }}>
                    <span style={{ color: '#64748b', fontSize: '12px' }}>Visa Limitations / Conditions:</span>
                    <div style={{ fontSize: '12px', color: '#1e293b', marginTop: '2px', fontStyle: 'italic' }}>
                      {employee.visaConditions}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 5: Attached Compliance Documents (Cloudinary) */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                  <FileText size={16} color="#2563eb" /> Attached Compliance Documents (Cloudinary Store)
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Uploaded ID documents, visas, passports, and proof of address stored securely
                </div>
              </div>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setJoiningModalTab('documents'); setJoiningModalOpen(true); }}
              >
                <ExternalLink size={13} /> Add / Manage Documents
              </button>
            </div>

            {employee.documents && employee.documents.length > 0 ? (
              <div className="table-responsive">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Document Title</th>
                      <th>Category</th>
                      <th>Uploaded On</th>
                      <th>Expiry Date & Status</th>
                      <th>Notes</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employee.documents.map(doc => {
                      const pill = getExpiryPill(doc.expiryDate);
                      return (
                        <tr key={doc._id}>
                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{doc.title}</div>
                            {doc.format && (
                              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
                                Format: {doc.format} {doc.bytes ? `• ${(doc.bytes / 1024).toFixed(0)} KB` : ''}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                              {doc.category || 'General Document'}
                            </span>
                          </td>
                          <td style={{ color: '#64748b', fontSize: '12px' }}>
                            {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('en-GB') : '—'}
                          </td>
                          <td>
                            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: pill.bg, color: pill.color }}>
                              {pill.label}
                            </span>
                          </td>
                          <td style={{ color: '#64748b', fontSize: '12px' }}>
                            {doc.notes || '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                              <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-outline btn-sm"
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                title="Open Document"
                              >
                                <ExternalLink size={12} /> View File
                              </a>
                              <button
                                className="btn btn-outline btn-sm"
                                style={{ padding: '4px 8px', fontSize: '11px', color: '#dc2626', borderColor: '#fca5a5' }}
                                onClick={() => handleDeleteDocument(doc._id)}
                                title="Delete Document"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                <FileText size={28} color="#94a3b8" style={{ marginBottom: '6px' }} />
                <div style={{ fontWeight: 600, color: '#334155', fontSize: '14px' }}>No documents uploaded yet</div>
                <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px', marginBottom: '12px' }}>
                  Upload passport copies, biometric residence permits (BRP), Home Office share codes, or Proof of Address.
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => { setJoiningModalTab('documents'); setJoiningModalOpen(true); }}
                >
                  Upload First Document (Cloudinary)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: Single Employee Monthly Statement (Matching User Reference Image 2: Shahab Ahmad) */}
      {activeTab === 'monthly_report' && (
        <div>
          {/* Month selector */}
          <div className="card" style={{ marginBottom: '16px', padding: '12px 18px' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label className="form-label" style={{ margin: 0 }}>Statement Month:</label>
                <select className="form-select" style={{ width: '130px' }} value={reportMonth} onChange={(e) => setReportMonth(e.target.value)}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(m => {
                    const d = new Date(Number(reportYear), Number(m) - 1, 1);
                    return <option key={m} value={m}>{d.toLocaleString('en-US', { month: 'long' })}</option>;
                  })}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label className="form-label" style={{ margin: 0 }}>Year:</label>
                <select className="form-select" style={{ width: '100px' }} value={reportYear} onChange={(e) => setReportYear(e.target.value)}>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                </select>
              </div>

              <button className="btn btn-outline btn-sm" onClick={downloadMonthlyPdf} disabled={downloadingMonthlyPdf} style={{ borderColor: '#dc2626', color: '#dc2626', fontWeight: 600 }}>
                <FileText size={14} color="#dc2626" /> {downloadingMonthlyPdf ? 'Preparing PDF...' : 'Download Monthly PDF'}
              </button>

              <button className="btn btn-outline btn-sm" onClick={downloadMonthlyExcel} disabled={downloadingMonthlyExcel}>
                <Download size={14} /> {downloadingMonthlyExcel ? 'Preparing Excel...' : 'Download Excel Formatted'}
              </button>
            </div>
          </div>

          {monthlyReportError && (
            <div role="alert" style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', marginBottom: '16px', fontSize: '13px' }}>
              {monthlyReportError}
            </div>
          )}

          {/* Spreadsheet Table matching Image 2 */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', border: '2px solid #000' }}>
            {/* Title: Name */}
            <div style={{ textAlign: 'center', padding: '12px', background: '#ffffff', borderBottom: '1px solid #000' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '1px' }}>
                {employee.name.toUpperCase()}
              </h2>
            </div>
            {/* Subtitle: Month-26 in Yellow bar */}
            <div style={{ textAlign: 'center', padding: '8px', background: '#ffff00', color: '#000', fontWeight: 'bold', fontSize: '16px', borderBottom: '2px solid #000' }}>
              {monthlyReportData?.monthLabel || 'May-26'}
            </div>

            <div className="table-responsive" style={{ border: 'none' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '13px' }}>
                <thead>
                  {/* Two major header categories */}
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <th colSpan="6" style={{ background: '#d9ead3', color: '#000', textAlign: 'center', padding: '8px', borderRight: '2px solid #000' }}>
                      Wage Details
                    </th>
                    <th colSpan="4" style={{ background: '#cfe2f3', color: '#000', textAlign: 'center', padding: '8px', borderRight: '2px solid #000' }}>
                      Payments
                    </th>
                    <th rowSpan="2" style={{ background: '#f4cccc', color: '#000', textAlign: 'center', padding: '8px', width: '90px' }}>
                      Balance
                    </th>
                  </tr>
                  <tr style={{ borderBottom: '2px solid #000', background: '#f8fafc', fontWeight: 'bold' }}>
                    <th style={{ padding: '8px', border: '1px solid #000' }}>Dates</th>
                    <th style={{ padding: '8px', border: '1px solid #000', background: '#ffff00', textAlign: 'center', width: '60px' }}>Days</th>
                    <th style={{ padding: '8px', border: '1px solid #000', textAlign: 'right' }}>Wage</th>
                    <th style={{ padding: '8px', border: '1px solid #000', textAlign: 'right' }}>Ded</th>
                    <th style={{ padding: '8px', border: '1px solid #000', textAlign: 'right' }}>Bonus</th>
                    <th style={{ padding: '8px', border: '1px solid #000', borderRight: '2px solid #000', textAlign: 'right' }}>Total</th>

                    <th style={{ padding: '8px', border: '1px solid #000' }}>Received Date</th>
                    <th style={{ padding: '8px', border: '1px solid #000', textAlign: 'right' }}>Cash</th>
                    <th style={{ padding: '8px', border: '1px solid #000', textAlign: 'right' }}>Bank</th>
                    <th style={{ padding: '8px', border: '1px solid #000', borderRight: '2px solid #000', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyReportData?.weeklyBreakdowns?.map((w, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #cbd5e1' }}>
                      <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>{w.weekDates}</td>
                      <td style={{ padding: '8px', border: '1px solid #cbd5e1', background: '#ffff00', textAlign: 'center', fontWeight: 'bold' }}>
                        {w.days || '-'}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{w.wage || '-'}</td>
                      <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', color: w.ded ? '#dc2626' : 'inherit' }}>{w.ded || '-'}</td>
                      <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', color: w.bonus ? '#16a34a' : 'inherit' }}>{w.bonus || '-'}</td>
                      <td style={{ padding: '8px', border: '1px solid #cbd5e1', borderRight: '2px solid #000', textAlign: 'right', fontWeight: 'bold' }}>{w.total || '-'}</td>

                      <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>{w.receivedDate || '-'}</td>
                      <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{w.cash ? w.cash.toFixed(2) : '-'}</td>
                      <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{w.bank ? w.bank.toFixed(2) : '-'}</td>
                      <td style={{ padding: '8px', border: '1px solid #cbd5e1', borderRight: '2px solid #000', textAlign: 'right', fontWeight: 'bold' }}>{w.paymentTotal ? w.paymentTotal.toFixed(2) : '-'}</td>

                      <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 'bold', color: w.balance ? '#d97706' : '#64748b' }}>
                        {w.balance ? w.balance.toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}

                  {(!monthlyReportData?.weeklyBreakdowns || monthlyReportData.weeklyBreakdowns.length === 0) && (
                    <tr>
                      <td colSpan="11" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        No records for this selected month.
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* Grand Total Row matching image 2 */}
                <tfoot>
                  <tr style={{ background: '#d9ead3', fontWeight: 'bold', borderTop: '2px solid #000', borderBottom: '2px solid #000' }}>
                    <td style={{ padding: '10px 8px', border: '1px solid #000' }}>
                      Grand Total ({monthlyReportData?.monthLabel || 'May 26'})
                    </td>
                    <td style={{ padding: '10px 8px', border: '1px solid #000', background: '#ffff00', textAlign: 'center' }}>
                      {monthlyReportData?.grandTotal?.days || 0}
                    </td>
                    <td style={{ padding: '10px 8px', border: '1px solid #000', textAlign: 'right' }}>
                      {monthlyReportData?.grandTotal?.wage || 0}
                    </td>
                    <td style={{ padding: '10px 8px', border: '1px solid #000', textAlign: 'right' }}>
                      {monthlyReportData?.grandTotal?.ded || '-'}
                    </td>
                    <td style={{ padding: '10px 8px', border: '1px solid #000', textAlign: 'right' }}>
                      {monthlyReportData?.grandTotal?.bonus || '-'}
                    </td>
                    <td style={{ padding: '10px 8px', border: '1px solid #000', borderRight: '2px solid #000', textAlign: 'right' }}>
                      {monthlyReportData?.grandTotal?.total || 0}
                    </td>
                    <td style={{ padding: '10px 8px', border: '1px solid #000' }}></td>
                    <td style={{ padding: '10px 8px', border: '1px solid #000', textAlign: 'right' }}>
                      {monthlyReportData?.grandTotal?.cash ? monthlyReportData.grandTotal.cash.toFixed(2) : '-'}
                    </td>
                    <td style={{ padding: '10px 8px', border: '1px solid #000', textAlign: 'right' }}>
                      {monthlyReportData?.grandTotal?.bank ? monthlyReportData.grandTotal.bank.toFixed(2) : '-'}
                    </td>
                    <td style={{ padding: '10px 8px', border: '1px solid #000', borderRight: '2px solid #000', textAlign: 'right' }}>
                      {monthlyReportData?.grandTotal?.paid ? monthlyReportData.grandTotal.paid.toFixed(2) : '-'}
                    </td>
                    <td style={{ padding: '10px 8px', border: '1px solid #000', textAlign: 'right' }}>
                      {monthlyReportData?.balancePayable ? monthlyReportData.balancePayable.toFixed(2) : '-'}
                    </td>
                  </tr>

                  {/* Yellow TOTAL BALANCE PAYABLE row */}
                  <tr style={{ background: '#ffff00', color: '#000', fontWeight: 'bold' }}>
                    <td colSpan="10" style={{ padding: '12px', border: '1px solid #000', textAlign: 'center', fontSize: '15px' }}>
                      TOTAL BALANCE PAYABLE
                    </td>
                    <td style={{ padding: '12px', border: '1px solid #000', textAlign: 'right', fontSize: '15px' }}>
                      {monthlyReportData?.balancePayable ? `£${monthlyReportData.balancePayable.toFixed(2)}` : '-'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Complete Accounting Ledger (Sections 16 & 49) */}
      {activeTab === 'ledger' && (
        <div>
          {/* Header & Export Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#0f172a' }}>
                Audit-Proof Financial Ledger
              </h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
                Complete chronological accounting trail of opening balance, weekly wages, bonuses, disbursements, and running balance.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={downloadLedgerPdf}
                disabled={downloadingLedgerPdf}
                title="Export Ledger PDF"
              >
                <FileText size={14} color="#dc2626" /> {downloadingLedgerPdf ? 'Preparing PDF...' : 'Export Ledger PDF'}
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={downloadLedgerExcel}
                disabled={downloadingLedgerExcel}
                title="Export Ledger Excel"
              >
                <Download size={14} /> {downloadingLedgerExcel ? 'Preparing Excel...' : 'Export Ledger Excel'}
              </button>
            </div>
          </div>

          {/* Ledger KPI Cards */}
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
              <div className="stat-lbl">Opening Balance</div>
              <div className="stat-val" style={{ color: '#8b5cf6' }}>
                £{(employee.openingBalance || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                {employee.openingBalanceNote || 'Balance Brought Forward'}
              </div>
            </div>

            <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
              <div className="stat-lbl">Total Wages & Bonuses Earned</div>
              <div className="stat-val" style={{ color: '#2563eb' }}>
                £{ledgerTotalEarned.toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Finalized Payroll, Bonus & Opening Bal
              </div>
            </div>

            <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="stat-lbl">Total Payments Disbursed</div>
              <div className="stat-val" style={{ color: '#059669' }}>
                £{ledgerTotalPaid.toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Cash & Bank Total
              </div>
            </div>

            <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="stat-lbl">Current Running Balance</div>
              <div className="stat-val" style={{ color: ledgerOutstanding > 0 ? '#dc2626' : '#10b981' }}>
                £{ledgerOutstanding.toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                {ledgerOutstanding > 0 ? 'Amount Owed to Worker' : 'Fully Settled / Cleared'}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Transaction Description</th>
                    <th>Details / Breakdown</th>
                    <th style={{ textAlign: 'right' }}>Earned / Credit (£)</th>
                    <th style={{ textAlign: 'right' }}>Paid / Debit (£)</th>
                    <th style={{ textAlign: 'right' }}>Running Balance (£)</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map(t => {
                    const isOpening = t.transactionType === 'OPENING_BALANCE';
                    return (
                      <tr key={t._id}>
                        <td>{new Date(t.date).toLocaleDateString('en-GB')}</td>
                        <td>
                          <span style={getLedgerBadgeStyle(t.transactionType)}>
                            {t.transactionType ? t.transactionType.replace(/_/g, ' ') : 'TRANSACTION'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{t.description}</td>
                        <td style={{ fontSize: '12px', color: '#64748b' }}>
                          {isOpening ? (
                            employee.openingBalanceNote || 'Initial Balance Brought Forward'
                          ) : t.transactionType === 'WAGE_INCREASE' ? (
                            [
                              t.breakdown?.previousWage !== undefined ? `Previous: £${Number(t.breakdown.previousWage).toFixed(2)}` : null,
                              t.breakdown?.newWage !== undefined ? `New Wage: £${Number(t.breakdown.newWage).toFixed(2)}` : null,
                              t.breakdown?.effectiveDate ? `Effective: ${new Date(t.breakdown.effectiveDate).toLocaleDateString('en-GB')}` : null,
                              t.breakdown?.reason ? `Reason: ${t.breakdown.reason}` : null
                            ].filter(Boolean).join(' • ') || 'Wage Rate Adjusted'
                          ) : t.breakdown ? (
                            [
                              t.breakdown.workingDays ? `${t.breakdown.workingDays}d worked` : null,
                              t.breakdown.grossSalary ? `Gross: £${t.breakdown.grossSalary.toFixed(2)}` : null,
                              t.breakdown.bonus > 0 ? `Bonus: +£${t.breakdown.bonus.toFixed(2)}` : null,
                              t.breakdown.deductions > 0 ? `Ded: -£${t.breakdown.deductions.toFixed(2)}` : null,
                              t.breakdown.paymentMethod ? `${t.breakdown.paymentMethod}${t.breakdown.paymentReference ? ` (${t.breakdown.paymentReference})` : ''}` : null,
                              t.breakdown.notes ? `Note: ${t.breakdown.notes}` : null
                            ].filter(Boolean).join(' • ') || '—'
                          ) : '—'}
                        </td>
                        <td style={{ fontWeight: 600, color: t.amountEarned > 0 ? '#2563eb' : '#94a3b8', textAlign: 'right' }}>
                          {t.amountEarned > 0 ? `+£${t.amountEarned.toFixed(2)}` : '—'}
                        </td>
                        <td style={{ fontWeight: 600, color: t.amountPaid > 0 ? '#10b981' : '#94a3b8', textAlign: 'right' }}>
                          {t.amountPaid > 0 ? `-£${t.amountPaid.toFixed(2)}` : '—'}
                        </td>
                        <td style={{ fontWeight: 700, color: (t.runningBalance || 0) > 0 ? '#d97706' : '#16a34a', fontSize: '14px', textAlign: 'right' }}>
                          £{(t.runningBalance || 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}

                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                        No ledger transactions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Worker Loan Ledger & Advance Repayments */}
      {activeTab === 'loan_ledger' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Summary Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
              <div className="stat-lbl" style={{ color: '#2563eb' }}>TOTAL LOANS BORROWED</div>
              <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px', color: '#0f172a' }}>
                £{Number(loansData.totalBorrowed || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                Total advances issued to date
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #059669' }}>
              <div className="stat-lbl" style={{ color: '#059669' }}>TOTAL REPAID</div>
              <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px', color: '#059669' }}>
                £{Number(loansData.totalRepaid || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                Collected via salary & direct payments
              </div>
            </div>

            <div className="card" style={{ borderLeft: Number(loansData.remainingBalance || 0) > 0 ? '4px solid #dc2626' : '4px solid #10b981' }}>
              <div className="stat-lbl" style={{ color: Number(loansData.remainingBalance || 0) > 0 ? '#dc2626' : '#10b981' }}>
                CURRENT OUTSTANDING BALANCE
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px', color: Number(loansData.remainingBalance || 0) > 0 ? '#dc2626' : '#10b981' }}>
                £{Number(loansData.remainingBalance || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                {Number(loansData.remainingBalance || 0) > 0 ? 'Worker currently owes this balance' : 'All loans fully settled'}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="card" style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HandCoins size={18} color="#2563eb" /> Worker Loan Ledger & Advance History
              </h2>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Track advances given, salary deductions collected during finalization, and cash/bank repayments.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                onClick={() => setGiveLoanModalOpen(true)}
              >
                <Plus size={14} /> Issue New Loan / Advance
              </button>
              {Number(loansData.remainingBalance || 0) > 0 && loansData.loans?.some(l => l.status === 'ACTIVE') && (
                <button
                  className="btn btn-outline btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5', fontWeight: 600 }}
                  onClick={() => {
                    const activeLoan = loansData.loans.find(l => l.status === 'ACTIVE');
                    setRepayTargetLoan(activeLoan);
                    setRepayAmount(activeLoan ? String(activeLoan.remainingBalance) : '');
                    setRepayModalOpen(true);
                  }}
                >
                  <HandCoins size={14} /> Record Direct Repayment
                </button>
              )}
            </div>
          </div>

          {/* Loan Ledger Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive">
              <table className="custom-table" style={{ fontSize: '12.5px', marginBottom: 0 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '10px 12px' }}>Date</th>
                    <th style={{ padding: '10px 12px' }}>Transaction Type</th>
                    <th style={{ padding: '10px 12px' }}>Reference / Details</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Disbursed (£)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Repaid (£)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>Loan Balance (£)</th>
                    <th style={{ padding: '10px 12px' }}>Method / Notes</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLoans ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        Loading loan ledger...
                      </td>
                    </tr>
                  ) : loansData.ledgerEvents && loansData.ledgerEvents.length > 0 ? (
                    loansData.ledgerEvents.map((evt, idx) => {
                      const isDisbursed = evt.type === 'LOAN_DISBURSED';
                      const isSalaryDed = evt.type === 'SALARY_DEDUCTION';
                      return (
                        <tr key={idx} style={{ background: isDisbursed ? '#f8fafc' : '#ffffff' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: '#334155' }}>
                            {evt.date ? new Date(evt.date).toLocaleDateString('en-GB') : '—'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {isDisbursed ? (
                              <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                💸 Loan Given / Advance
                              </span>
                            ) : isSalaryDed ? (
                              <span style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                📋 Salary Deduction
                              </span>
                            ) : (
                              <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                💵 Direct Repayment
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 500, color: '#0f172a' }}>
                            {evt.reference || '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: isDisbursed ? 700 : 400, color: isDisbursed ? '#2563eb' : '#94a3b8' }}>
                            {evt.amountBorrowed > 0 ? `£${evt.amountBorrowed.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: evt.amountRepaid > 0 ? 700 : 400, color: evt.amountRepaid > 0 ? '#059669' : '#94a3b8' }}>
                            {evt.amountRepaid > 0 ? `£${evt.amountRepaid.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: evt.runningBalance > 0 ? '#b45309' : '#059669', fontSize: '13.5px' }}>
                            £{Number(evt.runningBalance || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '12px' }}>
                            {evt.notes || evt.repaymentMethod || '—'}
                            {evt.recordedByName ? ` (${evt.recordedByName})` : ''}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            {isDisbursed && evt.loanId && (!loansData.loans?.find(l => l._id === evt.loanId)?.repayments?.length) ? (
                              <button
                                className="btn btn-outline btn-xs"
                                style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                                onClick={() => handleDeleteLoan(evt.loanId)}
                                title="Delete this loan"
                              >
                                <Trash2 size={12} />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                        No loans or cash advances recorded for this worker yet. Click "Issue New Loan / Advance" above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Attendance History */}
      {activeTab === 'attendance' && (
        <div className="card">
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shop</th>
                  <th>Shift Hours</th>
                  <th>Actual In - Out</th>
                  <th>Late (min)</th>
                  <th>Status</th>
                  <th>Daily Wage</th>
                  <th>Deduction</th>
                  <th>Net Wage</th>
                  <th>Approval</th>
                </tr>
              </thead>
              <tbody>
                {attendances.map(a => (
                  <tr key={a._id}>
                    <td>{new Date(a.date).toLocaleDateString('en-GB')}</td>
                    <td>{a.shopName}</td>
                    <td>{formatTime12Hour(a.shiftStart)} – {formatTime12Hour(a.shiftEnd)}</td>
                    <td>{formatTime12Hour(a.timeReached)} – {formatTime12Hour(a.workerEndTime)}</td>
                    <td>{a.lateMinutes > 0 ? `${a.lateMinutes}m` : '0m'}</td>
                    <td>
                      <span className={`badge badge-${a.status.toLowerCase()}`}>
                        {a.status}
                      </span>
                    </td>
                    <td>£{a.dailyWage}</td>
                    <td style={{ color: a.lateDeduction > 0 ? '#dc2626' : '#64748b' }}>
                      £{a.lateDeduction?.toFixed(2)}
                    </td>
                    <td style={{ fontWeight: 600 }}>£{a.attendancePay?.toFixed(2)}</td>
                    <td>
                      <span className={`badge badge-${a.approvalStatus === 'Checked' || a.approvalStatus === 'Finalized' ? 'checked' : 'pending'}`}>
                        {a.approvalStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Wage & Shop History */}
      {activeTab === 'history' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          {/* Wage History Card */}
          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Banknote size={16} color="#2563eb" /> Wage Adjustment History
            </h3>
            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', color: '#475569', marginBottom: '14px' }}>
              Current Daily Wage: <strong style={{ color: '#0f172a' }}>£{employee.dailyWage}</strong>
            </div>

            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Effective Date</th>
                    <th>Daily Wage</th>
                    <th>Reason / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {employee.wageHistory && employee.wageHistory.length > 0 ? (
                    employee.wageHistory.map((wh, idx) => (
                      <tr key={idx}>
                        <td>{new Date(wh.effectiveDate).toLocaleDateString('en-GB')}</td>
                        <td style={{ fontWeight: 600, color: '#2563eb' }}>£{wh.wage}</td>
                        <td style={{ color: '#64748b' }}>{wh.reason || 'Standard update'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', color: '#94a3b8', padding: '16px' }}>
                        Initial rate: £{employee.dailyWage} (No changes recorded)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Issue New Loan / Advance Modal */}
      {giveLoanModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HandCoins size={18} color="#2563eb" /> Issue Loan / Cash Advance
                </h2>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Worker: <strong>{employee?.name}</strong> ({employee?.employeeId})
                </div>
              </div>
              <button onClick={() => setGiveLoanModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateLoan}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Loan / Advance Amount (£) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    className="form-input"
                    placeholder="e.g. 200.00"
                    style={{ fontSize: '16px', fontWeight: 700, color: '#2563eb' }}
                    value={giveLoanAmount}
                    onChange={(e) => setGiveLoanAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Issue / Disbursed Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={giveLoanDate}
                    onChange={(e) => setGiveLoanDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Purpose / Reason</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Personal advance, emergency, travel support"
                    value={giveLoanReason}
                    onChange={(e) => setGiveLoanReason(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Internal Notes</label>
                  <textarea
                    className="form-input"
                    rows="2"
                    placeholder="Additional details regarding loan handover..."
                    value={giveLoanNotes}
                    onChange={(e) => setGiveLoanNotes(e.target.value)}
                  />
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#1e40af' }}>
                  ℹ️ This will open an active loan balance for {employee?.name}. You can deduct repayments automatically when finalizing weekly salaries or record direct cash repayments here.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setGiveLoanModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={givingLoan}>
                  {givingLoan ? 'Issuing Loan...' : 'Confirm & Issue Loan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Direct Loan Repayment Modal */}
      {repayModalOpen && repayTargetLoan && (
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ background: '#ecfdf5', borderBottom: '1px solid #a7f3d0' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HandCoins size={18} color="#059669" /> Record Direct Loan Repayment
                </h2>
                <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                  Worker: <strong>{employee?.name}</strong> • Outstanding Balance: <strong>£{repayTargetLoan.remainingBalance?.toFixed(2)}</strong>
                </div>
              </div>
              <button onClick={() => setRepayModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRecordRepayment}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Repayment Amount (£) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={repayTargetLoan.remainingBalance}
                    className="form-input"
                    placeholder="Enter repaid amount"
                    style={{ fontSize: '16px', fontWeight: 700, color: '#059669' }}
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    Maximum outstanding amount on this loan: £{repayTargetLoan.remainingBalance?.toFixed(2)}
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Payment Method *</label>
                  <select className="form-select" value={repayMethod} onChange={(e) => setRepayMethod(e.target.value)}>
                    <option value="Cash">Cash Handover</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Repayment Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={repayDate}
                    onChange={(e) => setRepayDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Notes / Receipt Reference</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Received cash at Camden shop"
                    value={repayNotes}
                    onChange={(e) => setRepayNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setRepayModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ background: '#059669', borderColor: '#059669' }} disabled={recordingRepay}>
                  {recordingRepay ? 'Recording Repayment...' : 'Confirm Repayment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Employee Joining & Profile Modal */}
      <EmployeeJoiningModal
        isOpen={joiningModalOpen}
        onClose={() => setJoiningModalOpen(false)}
        employee={employee}
        defaultTab={joiningModalTab}
        onSaved={() => {
          fetchProfile();
          setJoiningModalOpen(false);
        }}
        shops={shops}
      />
    </div>
  );
}
