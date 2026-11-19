import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Banknote,
  Calendar,
  Clock,
  Building2,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock3,
  ArrowLeft,
  ChevronRight,
  RotateCcw,
  Receipt,
  CreditCard,
  TrendingUp,
  Filter,
  X,
  Eye,
  Check,
  DollarSign
} from 'lucide-react';

const FILTER_PRESETS = [
  { id: 'THIS_WEEK', label: 'This Week' },
  { id: 'LAST_WEEK', label: 'Last Week' },
  { id: 'THIS_MONTH', label: 'This Month' },
  { id: 'LAST_MONTH', label: 'Last Month' },
  { id: 'THIS_YEAR', label: 'This Year' },
  { id: 'ALL', label: 'All Time' },
  { id: 'CUSTOM', label: 'Custom Date Range' }
];

export default function MySalary({ onBack }) {
  const [activeTab, setActiveTab] = useState('payslips'); // 'payslips' | 'ledger' | 'payments'
  const [filter, setFilter] = useState('ALL');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // Salaries data
  const [salaryData, setSalaryData] = useState(null);
  const [loadingSalaries, setLoadingSalaries] = useState(true);
  const [salaryError, setSalaryError] = useState('');

  // Selected payslip modal
  const [selectedPayslipId, setSelectedPayslipId] = useState(null);
  const [payslipDetails, setPayslipDetails] = useState(null);
  const [loadingPayslip, setLoadingPayslip] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Ledger data
  const [ledgerData, setLedgerData] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Payments data
  const [paymentsData, setPaymentsData] = useState(null);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const fetchSalaries = async (f = filter, s = customStart, e = customEnd) => {
    setLoadingSalaries(true);
    setSalaryError('');
    try {
      const params = { filter: f };
      if (f === 'CUSTOM' && s && e) {
        params.startDate = s;
        params.endDate = e;
      }
      const res = await api.get('/worker/salaries', { params });
      if (res.data?.success) {
        setSalaryData(res.data);
      }
    } catch (err) {
      console.error(err);
      setSalaryError(err.response?.data?.message || 'Failed to load salary records.');
    } finally {
      setLoadingSalaries(false);
    }
  };

  const fetchLedger = async () => {
    setLoadingLedger(true);
    try {
      const res = await api.get('/worker/ledger');
      if (res.data?.success) {
        setLedgerData(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLedger(false);
    }
  };

  const fetchPayments = async () => {
    setLoadingPayments(true);
    try {
      const res = await api.get('/worker/payments');
      if (res.data?.success) {
        setPaymentsData(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    fetchSalaries();
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'ledger' && !ledgerData) fetchLedger();
    if (tab === 'payments' && !paymentsData) fetchPayments();
  };

  const handleFilterSelect = (presetId) => {
    if (presetId === 'CUSTOM') {
      setShowCustomPicker(true);
      return;
    }
    setFilter(presetId);
    setShowCustomPicker(false);
    fetchSalaries(presetId);
  };

  const handleApplyCustomDate = (e) => {
    e.preventDefault();
    if (!customStart || !customEnd) return;
    setFilter('CUSTOM');
    setShowCustomPicker(false);
    fetchSalaries('CUSTOM', customStart, customEnd);
  };

  const handleOpenPayslip = async (salaryId) => {
    setSelectedPayslipId(salaryId);
    setLoadingPayslip(true);
    setPayslipDetails(null);
    try {
      const res = await api.get(`/worker/salaries/${salaryId}`);
      if (res.data?.success) {
        setPayslipDetails(res.data.payslip);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to load payslip details.');
      setSelectedPayslipId(null);
    } finally {
      setLoadingPayslip(false);
    }
  };

  const handleDownloadPdf = async (salaryId) => {
    setDownloadingPdf(true);
    try {
      const token = localStorage.getItem('token');
      const res = await api.get(`/worker/salaries/${salaryId}/payslip-pdf`, {
        responseType: 'blob'
      });

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Payslip_${salaryId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download PDF payslip. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="salary-page-container">
      {/* Header */}
      <div className="salary-header-card">
        <div className="salary-header-top">
          <button className="rota-back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
            <span>Dashboard</span>
          </button>
          <div className="salary-header-badge">
            <Banknote size={14} color="#10b981" />
            <span>Finalized Salary Ledger</span>
          </div>
        </div>

        <div className="salary-header-title-row">
          <div>
            <h1 className="salary-title">My Salary & Payslips</h1>
            <p className="salary-subtitle">
              Access your finalized weekly payslips, official PDF downloads, and personal ledger.
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="salary-view-tabs">
          <button
            className={`salary-tab-btn ${activeTab === 'payslips' ? 'active' : ''}`}
            onClick={() => handleTabChange('payslips')}
          >
            <FileText size={15} />
            <span>Weekly Payslips</span>
          </button>
          <button
            className={`salary-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
            onClick={() => handleTabChange('ledger')}
          >
            <Receipt size={15} />
            <span>Personal Ledger</span>
          </button>
          <button
            className={`salary-tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => handleTabChange('payments')}
          >
            <CreditCard size={15} />
            <span>Payment Receipts</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: WEEKLY PAYSLIPS */}
      {activeTab === 'payslips' && (
        <>
          {/* Summary Metric Cards */}
          {salaryData?.summary && (
            <div className="salary-summary-grid">
              <div className="salary-summary-card accent-green">
                <span className="summary-lbl">Latest Finalized</span>
                <span className="summary-val">
                  £{(salaryData.summary.latestFinalizedSalary?.finalSalary || 0).toFixed(2)}
                </span>
                <span className="summary-sub">
                  {salaryData.summary.latestFinalizedSalary?.weekLabel || 'No records'}
                </span>
              </div>

              <div className="salary-summary-card accent-blue">
                <span className="summary-lbl">This Month's Earnings</span>
                <span className="summary-val">
                  £{salaryData.summary.totalEarningsMonth.toFixed(2)}
                </span>
                <span className="summary-sub">finalized payroll</span>
              </div>

              <div className="salary-summary-card accent-purple">
                <span className="summary-lbl">Received This Month</span>
                <span className="summary-val">
                  £{salaryData.summary.totalReceivedMonth.toFixed(2)}
                </span>
                <span className="summary-sub">cash & bank payments</span>
              </div>

              <div className={`salary-summary-card ${salaryData.summary.outstandingBalance > 0 ? 'accent-amber' : 'accent-neutral'}`}>
                <span className="summary-lbl">Outstanding Balance</span>
                <span className="summary-val" style={{ color: salaryData.summary.outstandingBalance > 0 ? '#f59e0b' : '#10b981' }}>
                  £{salaryData.summary.outstandingBalance.toFixed(2)}
                </span>
                <span className="summary-sub">
                  {salaryData.summary.outstandingBalance > 0 ? 'Payment pending' : 'Fully settled'}
                </span>
              </div>
            </div>
          )}

          {/* Date Filter Pills */}
          <div className="salary-filter-bar">
            <div className="filter-presets-scroll">
              {FILTER_PRESETS.map(p => (
                <button
                  key={p.id}
                  className={`filter-pill-btn ${filter === p.id ? 'active' : ''}`}
                  onClick={() => handleFilterSelect(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {salaryData?.filterLabel && (
              <span className="filter-current-label">
                Showing: {salaryData.filterLabel}
              </span>
            )}
          </div>

          {/* Custom Date Picker Modal */}
          {showCustomPicker && (
            <div className="modal-backdrop" onClick={() => setShowCustomPicker(false)}>
              <div className="modal-content custom-date-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Select Custom Date Range</h3>
                  <button className="modal-close-btn" onClick={() => setShowCustomPicker(false)}>
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={handleApplyCustomDate} className="modal-body custom-date-form">
                  <div className="form-group">
                    <label>From Date</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>To Date</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value)}
                      required
                    />
                  </div>
                  <div className="modal-footer" style={{ border: 'none', padding: 0 }}>
                    <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                      Apply Date Filter
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Error Message */}
          {salaryError && (
            <div className="salary-error-card">
              <AlertCircle size={20} color="#ef4444" />
              <span>{salaryError}</span>
              <button className="btn-retry" onClick={() => fetchSalaries()}>
                <RotateCcw size={14} /> Retry
              </button>
            </div>
          )}

          {/* Loading Skeletons */}
          {loadingSalaries ? (
            <div className="skeleton-days-list">
              {[1, 2, 3].map(i => (
                <div key={i} className="skeleton-day-card" style={{ height: '110px' }} />
              ))}
            </div>
          ) : salaryData?.records?.length > 0 ? (
            <div className="salary-cards-list">
              {salaryData.records.map(record => {
                const isPaid = record.status === 'PAID';
                const isPartial = record.status === 'PARTIALLY_PAID';

                return (
                  <div key={record.id} className="salary-record-card">
                    <div className="record-header-row">
                      <div className="record-week-info">
                        <span className="record-week-title">{record.weekLabel}</span>
                        <div className="record-shop-tag">
                          <Building2 size={12} />
                          <span>{record.shopName}</span>
                          {record.shopsWorked?.length > 1 && (
                            <span className="multi-tag">+{record.shopsWorked.length - 1} more</span>
                          )}
                        </div>
                      </div>

                      <div className="record-status-col">
                        <span className={`salary-status-badge ${isPaid ? 'paid' : isPartial ? 'partial' : 'finalized'}`}>
                          {isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'FINALIZED'}
                        </span>
                      </div>
                    </div>

                    <div className="record-metrics-row">
                      <div className="metric-col">
                        <span className="metric-lbl">Days / Hours</span>
                        <span className="metric-val">{record.workingDays}d ({record.actualHours}h)</span>
                      </div>
                      <div className="metric-col">
                        <span className="metric-lbl">Gross Wages</span>
                        <span className="metric-val">£{record.grossDailyWages.toFixed(2)}</span>
                      </div>
                      <div className="metric-col highlight-net">
                        <span className="metric-lbl">Net Finalized</span>
                        <span className="metric-val-net">£{record.finalSalary.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="record-settlement-row">
                      <div className="settlement-info">
                        <span>Paid: <strong>£{record.totalPaid.toFixed(2)}</strong></span>
                        <span style={{ color: record.balanceRemaining > 0 ? '#fbbf24' : '#94a3b8' }}>
                          Balance: <strong>£{record.balanceRemaining.toFixed(2)}</strong>
                        </span>
                      </div>

                      <div className="record-actions-group">
                        <button
                          className="btn-payslip-action view"
                          onClick={() => handleOpenPayslip(record.id)}
                        >
                          <Eye size={14} />
                          <span>Payslip</span>
                        </button>

                        <button
                          className="btn-payslip-action download"
                          onClick={() => handleDownloadPdf(record.id)}
                          title="Download PDF"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="salary-empty-card">
              <Banknote size={36} color="#64748b" />
              <h3>No Finalized Salaries Found</h3>
              <p>
                There are no finalized weekly payslips for the selected period.
                Salaries become visible here once approved and locked by administration.
              </p>
            </div>
          )}
        </>
      )}

      {/* VIEW 2: PERSONAL LEDGER */}
      {activeTab === 'ledger' && (
        <div className="salary-ledger-view">
          {ledgerData?.summary && (
            <div className="ledger-overview-card">
              <div className="ledger-stat">
                <span className="ledger-stat-lbl">Total Salary Earned</span>
                <span className="ledger-stat-val text-blue">£{ledgerData.summary.totalEarned.toFixed(2)}</span>
                <span className="ledger-stat-sub">lifetime finalized</span>
              </div>
              <div className="ledger-stat">
                <span className="ledger-stat-lbl">Total Payments Received</span>
                <span className="ledger-stat-val text-green">£{ledgerData.summary.totalPaid.toFixed(2)}</span>
                <span className="ledger-stat-sub">disbursed installments</span>
              </div>
              <div className="ledger-stat">
                <span className="ledger-stat-lbl">Outstanding Balance</span>
                <span className={`ledger-stat-val ${ledgerData.summary.outstandingBalance > 0 ? 'text-amber' : 'text-slate'}`}>
                  £{ledgerData.summary.outstandingBalance.toFixed(2)}
                </span>
                <span className="ledger-stat-sub">owed to you</span>
              </div>
            </div>
          )}

          {loadingLedger ? (
            <div className="skeleton-days-list">
              {[1, 2, 3].map(i => (
                <div key={i} className="skeleton-day-card" style={{ height: '70px' }} />
              ))}
            </div>
          ) : ledgerData?.transactions?.length > 0 ? (
            <div className="ledger-timeline">
              {ledgerData.transactions.map((tx, idx) => {
                const isEarning = tx.amountEarned > 0;
                return (
                  <div key={tx.id || idx} className={`ledger-tx-card ${isEarning ? 'tx-earning' : 'tx-payment'}`}>
                    <div className="tx-icon-col">
                      {isEarning ? (
                        <div className="tx-icon-circle earning">
                          <TrendingUp size={16} color="#38bdf8" />
                        </div>
                      ) : (
                        <div className="tx-icon-circle payment">
                          <CreditCard size={16} color="#10b981" />
                        </div>
                      )}
                    </div>

                    <div className="tx-main-col">
                      <div className="tx-title-row">
                        <span className="tx-desc">{tx.description}</span>
                        <span className={`tx-amount ${isEarning ? 'text-blue' : 'text-green'}`}>
                          {isEarning ? `+£${tx.amountEarned.toFixed(2)}` : `-£${tx.amountPaid.toFixed(2)}`}
                        </span>
                      </div>

                      <div className="tx-meta-row">
                        <span className="tx-date">
                          {tx.date ? new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '...'}
                        </span>
                        <span className="tx-running">
                          Running Balance: <strong>£{tx.runningBalance.toFixed(2)}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="salary-empty-card">
              <Receipt size={36} color="#64748b" />
              <h3>No Ledger Transactions</h3>
              <p>Your ledger history will appear here once your first weekly salary or payment is recorded.</p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: PAYMENT RECEIPTS */}
      {activeTab === 'payments' && (
        <div className="salary-payments-view">
          {paymentsData && (
            <div className="payments-header-pill">
              <span>Total Payments Received: <strong>£{paymentsData.totalPaid.toFixed(2)}</strong> ({paymentsData.paymentsCount} receipts)</span>
            </div>
          )}

          {loadingPayments ? (
            <div className="skeleton-days-list">
              {[1, 2, 3].map(i => (
                <div key={i} className="skeleton-day-card" style={{ height: '70px' }} />
              ))}
            </div>
          ) : paymentsData?.payments?.length > 0 ? (
            <div className="payments-list">
              {paymentsData.payments.map((p, idx) => (
                <div key={p.id || idx} className="payment-receipt-card">
                  <div className="receipt-left">
                    <div className="receipt-icon-box">
                      <CreditCard size={18} color="#10b981" />
                    </div>
                    <div>
                      <span className="receipt-num">{p.receiptNumber}</span>
                      <span className="receipt-week">{p.weekLabel}</span>
                    </div>
                  </div>

                  <div className="receipt-right">
                    <span className="receipt-amount">+£{p.amount.toFixed(2)}</span>
                    <div className="receipt-meta">
                      <span className="receipt-method">{p.paymentMethod}</span>
                      <span className="receipt-date">
                        {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '...'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="salary-empty-card">
              <CreditCard size={36} color="#64748b" />
              <h3>No Payment Receipts Found</h3>
              <p>Receipts for salary disbursements will appear here when paid by management.</p>
            </div>
          )}
        </div>
      )}

      {/* DETAILED PAYSLIP MODAL */}
      {selectedPayslipId && (
        <div className="modal-backdrop" onClick={() => setSelectedPayslipId(null)}>
          <div className="payslip-modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Detailed Payslip Breakdown
                </h3>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedPayslipId(null)}>
                <X size={18} />
              </button>
            </div>

            {loadingPayslip ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading payslip snapshot...
              </div>
            ) : payslipDetails ? (
              <div className="payslip-modal-body">
                {/* Header Information Box */}
                <div className="payslip-info-box">
                  <div className="info-cell">
                    <span className="info-cell-lbl">EMPLOYEE</span>
                    <span className="info-cell-val">{payslipDetails.employeeName}</span>
                  </div>
                  <div className="info-cell">
                    <span className="info-cell-lbl">EMPLOYEE ID</span>
                    <span className="info-cell-val">{payslipDetails.employeeId}</span>
                  </div>
                  <div className="info-cell">
                    <span className="info-cell-lbl">SALARY WEEK</span>
                    <span className="info-cell-val">{payslipDetails.weekLabel}</span>
                  </div>
                  <div className="info-cell">
                    <span className="info-cell-lbl">SHOP BRANCH</span>
                    <span className="info-cell-val">{(payslipDetails.shopsWorked || [payslipDetails.shopName]).join(', ')}</span>
                  </div>
                </div>

                {/* Earnings & Deductions Tables */}
                <div className="payslip-tables-grid">
                  {/* Earnings */}
                  <div className="payslip-col-box">
                    <h4 className="payslip-col-title text-blue">Earnings Breakdown</h4>
                    <div className="col-row">
                      <span>Gross Daily Wages ({payslipDetails.workingDays} days)</span>
                      <span>£{payslipDetails.earnings.grossDailyWages.toFixed(2)}</span>
                    </div>
                    {payslipDetails.earnings.travelAllowance > 0 && (
                      <div className="col-row">
                        <span>Travel Allowance</span>
                        <span>£{payslipDetails.earnings.travelAllowance.toFixed(2)}</span>
                      </div>
                    )}
                    {payslipDetails.earnings.otherAllowances > 0 && (
                      <div className="col-row">
                        <span>Other Allowances</span>
                        <span>£{payslipDetails.earnings.otherAllowances.toFixed(2)}</span>
                      </div>
                    )}
                    {payslipDetails.earnings.bonus > 0 && (
                      <div className="col-row">
                        <span>Sales / Bonus Credit</span>
                        <span>£{payslipDetails.earnings.bonus.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="col-row total">
                      <span>Total Gross</span>
                      <span>£{payslipDetails.earnings.grossTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Deductions */}
                  <div className="payslip-col-box">
                    <h4 className="payslip-col-title text-red">Deductions Breakdown</h4>
                    <div className="col-row">
                      <span>Late Arrival Deductions</span>
                      <span>£{payslipDetails.deductions.lateDeductions.toFixed(2)}</span>
                    </div>
                    {payslipDetails.deductions.manualDeductions > 0 && (
                      <div className="col-row">
                        <span>Authorized Adjustments</span>
                        <span>£{payslipDetails.deductions.manualDeductions.toFixed(2)}</span>
                      </div>
                    )}
                    {payslipDetails.deductions.loanDeduction > 0 && (
                      <div className="col-row">
                        <span>Loan Repayment</span>
                        <span>£{payslipDetails.deductions.loanDeduction.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="col-row total">
                      <span>Total Deductions</span>
                      <span>£{payslipDetails.deductions.totalDeductions.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Net Finalized Salary Banner */}
                <div className="payslip-net-banner">
                  <div>
                    <span className="net-banner-lbl">NET FINALIZED SALARY</span>
                    <span className="net-banner-sub">Approved and verified</span>
                  </div>
                  <span className="net-banner-val">£{payslipDetails.finalSalary.toFixed(2)}</span>
                </div>

                {/* Settlement Card */}
                <div className="payslip-settlement-card">
                  <div className="settlement-stat">
                    <span>Amount Paid: <strong>£{payslipDetails.totalPaid.toFixed(2)}</strong></span>
                  </div>
                  <div className="settlement-stat">
                    <span>Remaining: <strong style={{ color: payslipDetails.balanceRemaining > 0 ? '#fbbf24' : '#10b981' }}>£{payslipDetails.balanceRemaining.toFixed(2)}</strong></span>
                  </div>
                  <div className="settlement-stat">
                    <span>Status: <strong>{payslipDetails.status}</strong></span>
                  </div>
                </div>

                {/* Payments History Table if any */}
                {payslipDetails.payments?.length > 0 && (
                  <div className="payslip-payments-box">
                    <h5 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Payment Disbursements
                    </h5>
                    {payslipDetails.payments.map((p, idx) => (
                      <div key={p.id || idx} className="payslip-payment-row">
                        <span>{new Date(p.paymentDate).toLocaleDateString('en-GB')} ({p.paymentMethod})</span>
                        <span className="font-mono">{p.clientReference}</span>
                        <span className="text-green font-bold">£{p.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                className="btn-download-pdf-modal"
                onClick={() => handleDownloadPdf(selectedPayslipId)}
                disabled={downloadingPdf || !payslipDetails}
              >
                <Download size={16} />
                <span>{downloadingPdf ? 'Generating PDF...' : 'Download Official PDF'}</span>
              </button>

              <button className="btn-close-modal" onClick={() => setSelectedPayslipId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
