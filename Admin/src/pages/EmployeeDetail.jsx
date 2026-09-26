import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { downloadReportFile } from '../utils/downloadReportFile';
import { formatTime12Hour } from '../utils/formatTime';
import { ArrowLeft, Download, Banknote, Clock, Award, ShieldAlert, FileText } from 'lucide-react';

function getApiFailureMessage(error, fallback) {
  if (!error.response) {
    return `Cannot connect to ${API_BASE_URL}. Make sure the backend is running and reachable.`;
  }
  return error.response.data?.message || fallback;
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Monthly Report State (Matching Image 2)
  const [reportMonth, setReportMonth] = useState('5'); // May
  const [reportYear, setReportYear] = useState('2026');
  const [monthlyReportData, setMonthlyReportData] = useState(null);
  const [monthlyReportError, setMonthlyReportError] = useState('');
  const [downloadingMonthlyExcel, setDownloadingMonthlyExcel] = useState(false);
  const [activeTab, setActiveTab] = useState('monthly_report'); // 'monthly_report', 'ledger', 'attendance', 'salaries'

  useEffect(() => {
    fetchProfile();
    fetchMonthlyReport();
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
              {employee.email ? <> • Email: <strong>{employee.email}</strong></> : null}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-outline btn-sm" onClick={downloadMonthlyExcel} disabled={downloadingMonthlyExcel}>
              <Download size={14} /> {downloadingMonthlyExcel ? 'Preparing Excel...' : 'Export Monthly Excel'}
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

      {/* Tabs navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '20px' }}>
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
                    const d = new Date(2026, Number(m) - 1, 1);
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
        <div className="card">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
              Audit-Proof Financial Ledger
            </h2>
            <p style={{ fontSize: '12px', color: '#64748b' }}>
              Tracks every earned wage, payment disbursement installment, and running balance without duplication
            </p>
          </div>

          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transaction Description</th>
                  <th>Type</th>
                  <th>Wage / Earned</th>
                  <th>Payment Disbursed</th>
                  <th>Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(t => (
                  <tr key={t._id}>
                    <td>{new Date(t.date).toLocaleDateString('en-GB')}</td>
                    <td style={{ fontWeight: 500 }}>{t.description}</td>
                    <td>
                      <span className={`badge ${t.transactionType === 'SALARY_EARNED' ? 'badge-finalized' : 'badge-paid'}`}>
                        {t.transactionType.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: t.amountEarned > 0 ? '#2563eb' : '#94a3b8' }}>
                      {t.amountEarned > 0 ? `+£${t.amountEarned.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ fontWeight: 600, color: t.amountPaid > 0 ? '#10b981' : '#94a3b8' }}>
                      {t.amountPaid > 0 ? `-£${t.amountPaid.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ fontWeight: 700, color: t.runningBalance > 0 ? '#d97706' : '#16a34a', fontSize: '14px' }}>
                      £{t.runningBalance?.toFixed(2)}
                    </td>
                  </tr>
                ))}

                {ledger.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      No ledger transactions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
    </div>
  );
}
