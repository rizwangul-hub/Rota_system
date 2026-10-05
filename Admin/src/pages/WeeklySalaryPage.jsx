import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { formatTime12Hour } from '../utils/formatTime';
import {
  Calculator,
  Calendar,
  Building2,
  RefreshCw,
  Eye,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  ShieldCheck,
  Search,
  Info,
  Plus,
  Trash2,
  Edit2,
  Lock,
  BadgeDollarSign,
  TrendingUp,
  TrendingDown,
  Landmark
} from 'lucide-react';

const ADJUSTMENT_TYPES = [
  { value: 'TRAVEL_ALLOWANCE', label: 'Travel Allowance', color: '#2563eb' },
  { value: 'OTHER_ALLOWANCE', label: 'Other Allowance', color: '#16a34a' },
  { value: 'OTHER_DEDUCTION', label: 'Other Deduction', color: '#dc2626' },
  { value: 'MANUAL_DEDUCTION', label: 'Manual Deduction', color: '#b91c1c' }
];

function AdjustmentTypeTag({ type }) {
  const found = ADJUSTMENT_TYPES.find(t => t.value === type);
  return (
    <span style={{
      background: found ? `${found.color}18` : '#f1f5f9',
      color: found?.color || '#64748b',
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '12px',
      fontWeight: 600
    }}>
      {found?.label || type}
    </span>
  );
}

export default function WeeklySalaryPage() {
  const [salaries, setSalaries] = useState([]);
  const [totals, setTotals] = useState({
    totalEmployees: 0,
    totalWorkingDays: 0,
    totalScheduledHours: 0,
    totalActualHours: 0,
    grossAttendanceWages: 0,
    totalLateDeductions: 0,
    totalAttendancePay: 0
  });

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Date & Week State
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [weekInfo, setWeekInfo] = useState(null);

  // Filter states
  const [selectedShop, setSelectedShop] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [shops, setShops] = useState([]);

  // Detail Modal
  const [detailSalary, setDetailSalary] = useState(null);
  const [detailData, setDetailData] = useState(null); // full detail with adjustments
  const [detailLoading, setDetailLoading] = useState(false);

  // Adjustment Modal
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjEditTarget, setAdjEditTarget] = useState(null); // null = add, object = edit
  const [adjType, setAdjType] = useState('TRAVEL_ALLOWANCE');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);

  // Direct Deduction Modal state
  const [deductionModalOpen, setDeductionModalOpen] = useState(false);
  const [deductionTargetSalary, setDeductionTargetSalary] = useState(null);
  const [weeklySalaryAmountInput, setWeeklySalaryAmountInput] = useState('');
  const [deductionAmountInput, setDeductionAmountInput] = useState('');
  const [deductionReasonInput, setDeductionReasonInput] = useState('');
  const [deductionSaving, setDeductionSaving] = useState(false);

  // Finalize state
  const [finalizing, setFinalizing] = useState(false);

  // Ledger state
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [ledgerEmployee, setLedgerEmployee] = useState(null);
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [ledgerTotals, setLedgerTotals] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const handleOpenLedger = async (employee) => {
    if (!employee) return;
    setLedgerEmployee(employee);
    setLedgerModalOpen(true);
    setLedgerLoading(true);
    try {
      const empId = employee._id || employee;
      const res = await axios.get(`${API_BASE_URL}/salaries/ledger/employee/${empId}`);
      if (res.data.success) {
        setLedgerTransactions(res.data.transactions || []);
        setLedgerTotals(res.data.totals || { earned: 0, paid: 0, outstanding: 0 });
      }
    } catch (err) {
      console.error('Error fetching employee ledger:', err);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    fetchShops();
  }, []);

  useEffect(() => {
    fetchWeekInfoAndSalaries();
  }, [selectedDate, selectedShop, statusFilter, searchQuery]);

  const fetchShops = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/shops`);
      if (res.data.success) setShops(res.data.shops || []);
    } catch (err) {
      console.error('Error fetching shops:', err);
    }
  };

  const showNotification = (msg, isError = false) => {
    setFeedback({ text: msg, isError });
    setTimeout(() => setFeedback(null), 5000);
  };

  const fetchWeekInfoAndSalaries = async () => {
    setLoading(true);
    try {
      const infoRes = await axios.get(`${API_BASE_URL}/salaries/week-info`, {
        params: { date: selectedDate, shopId: selectedShop || undefined }
      });
      if (infoRes.data.success) setWeekInfo(infoRes.data);

      const params = { date: selectedDate };
      if (selectedShop) params.shopId = selectedShop;
      if (statusFilter && statusFilter !== 'All') params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const salRes = await axios.get(`${API_BASE_URL}/salaries`, { params });
      if (salRes.data.success) {
        setSalaries(salRes.data.salaries || []);
        if (salRes.data.totals) setTotals(salRes.data.totals);
      }
    } catch (err) {
      console.error('Error loading weekly salaries:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShiftWeek = (offsetDays) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + offsetDays);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const handleSetToday = () => setSelectedDate(new Date().toISOString().split('T')[0]);

  const handleGenerateWeeklySalaries = async () => {
    setGenerating(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/salaries/generate`, {
        date: selectedDate,
        shopId: selectedShop || undefined
      });
      if (res.data.success) {
        showNotification(res.data.message || 'Weekly salary calculated successfully.');
        fetchWeekInfoAndSalaries();
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to generate weekly salaries.', true);
    } finally {
      setGenerating(false);
    }
  };

  // Open the detail modal and fetch full detail (with adjustments)
  const handleViewDetail = async (salary) => {
    setDetailSalary(salary);
    setDetailData(null);
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/salaries/${salary._id}`);
      if (res.data.success) setDetailData(res.data);
    } catch (err) {
      console.error('Error loading salary detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailSalary(null);
    setDetailData(null);
  };

  // Open add adjustment modal
  const openAddAdjustment = () => {
    setAdjEditTarget(null);
    setAdjType('TRAVEL_ALLOWANCE');
    setAdjAmount('');
    setAdjReason('');
    setAdjModalOpen(true);
  };

  // Open edit adjustment modal
  const openEditAdjustment = (adj) => {
    setAdjEditTarget(adj);
    setAdjType(adj.type);
    setAdjAmount(String(adj.amount));
    setAdjReason(adj.reason || '');
    setAdjModalOpen(true);
  };

  const handleSaveAdjustment = async (e) => {
    e.preventDefault();
    const amount = Number(adjAmount);
    if (!adjAmount || isNaN(amount) || amount <= 0) {
      showNotification('Amount must be a positive number.', true);
      return;
    }
    if (!adjReason.trim()) {
      showNotification('Reason is required.', true);
      return;
    }
    setAdjSaving(true);
    try {
      let res;
      if (adjEditTarget) {
        res = await axios.put(`${API_BASE_URL}/salaries/adjustments/${adjEditTarget._id}`, {
          type: adjType,
          amount,
          reason: adjReason.trim()
        });
      } else {
        res = await axios.post(`${API_BASE_URL}/salaries/${detailSalary._id}/adjustments`, {
          type: adjType,
          amount,
          reason: adjReason.trim()
        });
      }
      if (res.data.success) {
        showNotification(adjEditTarget ? 'Adjustment updated.' : 'Adjustment added.');
        setAdjModalOpen(false);
        // Refresh full detail
        await handleViewDetail(detailSalary);
        // Update salary in list
        fetchWeekInfoAndSalaries();
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to save adjustment.', true);
    } finally {
      setAdjSaving(false);
    }
  };

  const handleDeleteAdjustment = async (adjId) => {
    if (!window.confirm('Remove this adjustment?')) return;
    try {
      const res = await axios.delete(`${API_BASE_URL}/salaries/adjustments/${adjId}`);
      if (res.data.success) {
        showNotification('Adjustment removed.');
        await handleViewDetail(detailSalary);
        fetchWeekInfoAndSalaries();
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to remove adjustment.', true);
    }
  };

  const openEditDeductionModal = (salary) => {
    setDeductionTargetSalary(salary);
    setWeeklySalaryAmountInput(String(salary.weeklySalaryOverride ?? salary.netAttendancePay ?? 0));
    setDeductionAmountInput(salary.manualDeductions ? String(salary.manualDeductions) : '0');
    setDeductionReasonInput('Manual deduction adjustment');
    setDeductionModalOpen(true);
  };

  const handleSaveDeduction = async (e) => {
    e.preventDefault();
    const weeklySalaryAmount = Number(weeklySalaryAmountInput);
    const amount = Number(deductionAmountInput);
    if (!Number.isFinite(weeklySalaryAmount) || weeklySalaryAmount < 0) {
      showNotification('Weekly salary must be 0 or a positive number.', true);
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      showNotification('Deduction amount must be 0 or a positive number.', true);
      return;
    }
    setDeductionSaving(true);
    try {
      const res = await axios.put(`${API_BASE_URL}/salaries/${deductionTargetSalary._id}/deduction`, {
        weeklySalaryAmount,
        deductionAmount: amount,
        reason: deductionReasonInput.trim() || 'Manual deduction adjustment'
      });
      if (res.data.success) {
        showNotification(res.data.message || 'Weekly salary deduction updated.');
        setDeductionModalOpen(false);
        if (detailSalary && detailSalary._id === deductionTargetSalary._id) {
          await handleViewDetail(deductionTargetSalary);
        }
        fetchWeekInfoAndSalaries();
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to update deduction.', true);
    } finally {
      setDeductionSaving(false);
    }
  };

  const handleFinalizeSalary = async () => {
    if (!detailSalary) return;
    if (!window.confirm(`Finalize salary for ${detailSalary.employeeName}? This will lock the record.`)) return;
    setFinalizing(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/salaries/${detailSalary._id}/finalize`);
      if (res.data.success) {
        showNotification(`Salary for ${detailSalary.employeeName} finalized.`);
        await handleViewDetail({ ...detailSalary, _id: detailSalary._id });
        fetchWeekInfoAndSalaries();
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to finalize salary.', true);
    } finally {
      setFinalizing(false);
    }
  };

  const isFinalized = (s) => ['FINALIZED', 'PAID', 'Finalized', 'Paid', 'PARTIALLY_PAID'].includes(s?.status);
  const alreadyGenerated = salaries.length > 0;

  // The salary breakdown shown in the detail modal
  const activeSalary = detailData?.salary || detailSalary;

  return (
    <div className="page-container">
      {/* Toast Notification */}
      {feedback && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: feedback.isError ? '#ef4444' : '#10b981',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 500,
          fontSize: '13px'
        }}>
          {feedback.isError ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Weekly Attendance Salary
            </h1>
            <span style={{
              background: '#eff6ff',
              color: '#2563eb',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <ShieldCheck size={12} /> Phase 6 Engine
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', margin: 0 }}>
            Monday–Sunday salary with allowances, deductions & commission adjustments.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleGenerateWeeklySalaries}
            disabled={generating}
            style={{ fontWeight: 600 }}
          >
            <Calculator size={15} /> {alreadyGenerated ? 'Regenerate' : 'Generate Salary'}
          </button>
        </div>
      </div>

      {/* Week Selector Bar */}
      <div className="card" style={{ marginBottom: '16px', padding: '14px 20px', background: '#f8fafc', borderColor: '#cbd5e1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button className="btn btn-outline btn-sm" style={{ padding: '6px 8px' }} onClick={() => handleShiftWeek(-7)}>
                <ChevronLeft size={16} />
              </button>
              <button className="btn btn-outline btn-sm" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={handleSetToday}>
                This Week
              </button>
              <button className="btn btn-outline btn-sm" style={{ padding: '6px 8px' }} onClick={() => handleShiftWeek(7)}>
                <ChevronRight size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={16} color="#2563eb" />
              <label className="form-label" style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Date in Week:</label>
              <input
                type="date"
                className="form-input"
                style={{ width: '145px', padding: '6px 10px', fontSize: '13px' }}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            {weekInfo?.week && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                padding: '6px 14px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '14px',
                color: '#1e293b'
              }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>Period: </span>
                {weekInfo.week.weekLabel}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              background: '#ecfdf5',
              color: '#047857',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <CheckCircle2 size={13} /> {weekInfo?.checkedCount || 0} Checked
            </span>

            {(weekInfo?.pendingCount || 0) > 0 ? (
              <span style={{
                background: '#fff7ed',
                color: '#c2410c',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Clock size={13} /> {weekInfo.pendingCount} Pending
              </span>
            ) : (
              <span style={{ background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '6px', fontSize: '12px' }}>
                0 Pending
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pending Warning Banner */}
      {weekInfo?.warning && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fef3c7',
          padding: '12px 18px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#b45309',
          fontSize: '13px'
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Pending Attendance Notice:</strong> {weekInfo.warning}
            {weekInfo.pendingEmployees?.length > 0 && (
              <span style={{ marginLeft: '6px', color: '#92400e' }}>
                (Pending staff: {weekInfo.pendingEmployees.join(', ')})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div className="stat-card" style={{ padding: '12px 14px' }}>
          <div className="stat-lbl">Total Staff</div>
          <div className="stat-val" style={{ fontSize: '20px' }}>{totals.totalEmployees}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px' }}>
          <div className="stat-lbl">Working Days</div>
          <div className="stat-val" style={{ fontSize: '20px', color: '#2563eb' }}>{totals.totalWorkingDays}d</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px' }}>
          <div className="stat-lbl">Scheduled Hours</div>
          <div className="stat-val" style={{ fontSize: '20px' }}>{totals.totalScheduledHours}h</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px' }}>
          <div className="stat-lbl">Actual Hours</div>
          <div className="stat-val" style={{ fontSize: '20px' }}>{totals.totalActualHours}h</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px' }}>
          <div className="stat-lbl">Gross Daily Wages</div>
          <div className="stat-val" style={{ fontSize: '20px' }}>£{totals.grossAttendanceWages.toFixed(2)}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px', borderLeft: '3px solid #dc2626' }}>
          <div className="stat-lbl" style={{ color: '#dc2626' }}>Late Deductions</div>
          <div className="stat-val" style={{ fontSize: '20px', color: '#dc2626' }}>
            {totals.totalLateDeductions > 0 ? `-£${totals.totalLateDeductions.toFixed(2)}` : '£0.00'}
          </div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px', borderLeft: '3px solid #16a34a' }}>
          <div className="stat-lbl" style={{ color: '#16a34a' }}>Net Attendance Pay</div>
          <div className="stat-val" style={{ fontSize: '20px', color: '#16a34a', fontWeight: 800 }}>
            £{totals.totalAttendancePay.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={15} color="#64748b" />
            <label className="form-label" style={{ margin: 0, fontSize: '13px' }}>Shop:</label>
            <select className="form-select" style={{ width: '180px', padding: '6px 10px', fontSize: '13px' }} value={selectedShop} onChange={(e) => setSelectedShop(e.target.value)}>
              <option value="">All Shops</option>
              {shops.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '13px' }}>Status:</label>
            <select className="form-select" style={{ width: '140px', padding: '6px 10px', fontSize: '13px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Generated">Generated</option>
              <option value="GENERATED">Generated (legacy)</option>
              <option value="FINALIZED">Finalized</option>
              <option value="PAID">Paid</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 200px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '32px', fontSize: '13px', width: '100%' }}
                placeholder="Search staff name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <button className="btn btn-outline btn-sm" onClick={fetchWeekInfoAndSalaries}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Weekly Salaries Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive" style={{ border: 'none' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Shop(s)</th>
                <th>Working Days</th>
                <th>Actual Hours</th>
                <th>Gross Wages</th>
                <th>Late Ded.</th>
                <th>Attendance Pay</th>
                <th>Allowances</th>
                <th>Bonus</th>
                <th>Deductions</th>
                <th style={{ fontWeight: 800, color: '#0f172a' }}>Final Salary</th>
                <th>Paid</th>
                <th>Outstanding</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {salaries.map(s => {
                const hasAdj = (s.travelAllowance || 0) + (s.otherAllowances || 0) + (s.bonus || 0) + (s.manualDeductions || 0) > 0;
                return (
                  <tr key={s._id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{s.employeeName}</div>
                    </td>
                    <td><span style={{ fontSize: '12px', fontWeight: 500 }}>{s.shopName}</span></td>
                    <td>
                      <span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
                        {s.workingDays || 0}d
                      </span>
                    </td>
                    <td style={{ fontSize: '12px' }}>{s.actualHours?.toFixed(1) || '0.0'}h</td>
                    <td style={{ fontSize: '12px' }}>£{s.grossDailyWages?.toFixed(2) || '0.00'}</td>
                    <td style={{ color: (s.lateDeductions || 0) > 0 ? '#dc2626' : '#64748b', fontSize: '12px', fontWeight: (s.lateDeductions || 0) > 0 ? 700 : 400 }}>
                      {(s.lateDeductions || 0) > 0 ? `-£${s.lateDeductions.toFixed(2)}` : '£0.00'}
                    </td>
                    <td style={{ fontWeight: 700, fontSize: '13px' }}>
                      £{(s.netAttendancePay || 0).toFixed(2)}
                    </td>
                    <td style={{ fontSize: '12px', color: '#16a34a', fontWeight: hasAdj ? 600 : 400 }}>
                      {((s.travelAllowance || 0) + (s.otherAllowances || 0)) > 0
                        ? `+£${((s.travelAllowance || 0) + (s.otherAllowances || 0)).toFixed(2)}`
                        : '—'
                      }
                    </td>
                    <td style={{ fontSize: '12px', color: '#7c3aed', fontWeight: (s.bonus || 0) > 0 ? 600 : 400 }}>
                      {(s.bonus || 0) > 0 ? `+£${s.bonus.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ fontSize: '12px', color: '#dc2626', fontWeight: (s.manualDeductions || 0) > 0 ? 600 : 400 }}>
                      {(s.manualDeductions || 0) > 0 ? `-£${s.manualDeductions.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>
                      £{(s.finalSalary || s.netAttendancePay || 0).toFixed(2)}
                    </td>
                    <td style={{ fontSize: '13px', color: '#059669', fontWeight: 600 }}>
                      £{(s.totalPaid || 0).toFixed(2)}
                    </td>
                    <td style={{ fontSize: '13px', color: (s.balanceRemaining || 0) > 0 ? '#d97706' : '#16a34a', fontWeight: 700 }}>
                      £{(s.balanceRemaining !== undefined ? s.balanceRemaining : (s.finalSalary || 0)).toFixed(2)}
                    </td>
                    <td>
                      <span className={`badge badge-${(s.status || 'generated').toLowerCase()}`}>
                        {s.status || 'Generated'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#dc2626', borderColor: '#fca5a5' }}
                          onClick={() => openEditDeductionModal(s)}
                          disabled={isFinalized(s)}
                          title="Edit Employee Deduction"
                        >
                          <Edit2 size={12} /> Edit Salary
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => handleViewDetail(s)}
                        >
                          <Eye size={13} /> Details
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {salaries.length === 0 && !loading && (
                <tr>
                  <td colSpan="15" style={{ textAlign: 'center', padding: '48px 16px', color: '#94a3b8' }}>
                    <div style={{ fontSize: '18px', marginBottom: '8px' }}>💰 No weekly salary records for this period</div>
                    <div style={{ fontSize: '13px' }}>
                      Click <strong>"Generate Salary"</strong> above to calculate attendance wages from Sarfraz-approved records.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== DETAIL MODAL ===== */}
      {detailSalary && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '820px' }}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Info size={18} color="#2563eb" />
                  Weekly Salary: {activeSalary?.employeeName}
                </h2>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Period: <strong>{activeSalary?.weekLabel}</strong>
                  {' '}•{' '}
                  <span className={`badge badge-${(activeSalary?.status || 'generated').toLowerCase()}`} style={{ fontSize: '11px' }}>
                    {activeSalary?.status || 'Generated'}
                  </span>
                </div>
              </div>
              <button onClick={closeDetail} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ fontSize: '13px' }}>
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading details...</div>
              ) : (
                <>
                  {/* Day-by-Day Attendance Breakdown */}
                  <div style={{ fontWeight: 700, fontSize: '12px', color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Daily Attendance Breakdown
                  </div>
                  <div className="table-responsive" style={{ marginBottom: '20px' }}>
                    <table className="custom-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th>Day &amp; Date</th>
                          <th>Shop</th>
                          <th>Shift Schedule</th>
                          <th>Actual Times</th>
                          <th>Status</th>
                          <th>Daily Wage</th>
                          <th>Late (Mins)</th>
                          <th>Late Ded.</th>
                          <th style={{ textAlign: 'right' }}>Net Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeSalary?.attendanceBreakdown?.length > 0 ? (
                          activeSalary.attendanceBreakdown.map((row, idx) => (
                            <tr key={idx}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{row.dayOfWeek || 'Day'}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{row.dateString}</div>
                              </td>
                              <td>{row.shopName}</td>
                              <td>{formatTime12Hour(row.shiftStart)} – {formatTime12Hour(row.shiftEnd)}</td>
                              <td>
                                <span style={{ fontWeight: 500 }}>{formatTime12Hour(row.timeReached)} – {formatTime12Hour(row.workerEndTime)}</span>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{row.actualHours} hrs</div>
                              </td>
                              <td>
                                <span className={`badge badge-${(row.status || 'present').toLowerCase()}`}>
                                  {row.status}
                                </span>
                              </td>
                              <td>£{row.dailyWage?.toFixed(2)}</td>
                              <td>
                                {row.lateMinutes > 0 ? (
                                  <span style={{ color: row.lateMinutes > 15 ? '#dc2626' : '#d97706', fontWeight: 600 }}>
                                    +{row.lateMinutes}m
                                  </span>
                                ) : (
                                  <span style={{ color: '#16a34a' }}>0m</span>
                                )}
                              </td>
                              <td style={{ color: row.lateDeduction > 0 ? '#dc2626' : '#64748b', fontWeight: row.lateDeduction > 0 ? 600 : 400 }}>
                                {row.lateDeduction > 0 ? `-£${row.lateDeduction.toFixed(2)}` : '£0.00'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                £{row.attendancePay?.toFixed(2)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="9" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                              No individual breakdown stored for this salary.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* ===== PHASE 6 ADJUSTMENTS SECTION ===== */}
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '16px 18px',
                    marginBottom: '20px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ fontWeight: 700, fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>
                        Salary Adjustments
                      </div>
                      {!isFinalized(activeSalary) && (
                        <button className="btn btn-primary btn-sm" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={openAddAdjustment}>
                          <Plus size={13} /> Add Adjustment
                        </button>
                      )}
                    </div>

                    {detailData?.adjustments?.length > 0 ? (
                      <table className="custom-table" style={{ fontSize: '12px', marginBottom: '0' }}>
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Reason</th>
                            <th>Added By</th>
                            {!isFinalized(activeSalary) && <th style={{ textAlign: 'right' }}>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {detailData.adjustments.map(adj => (
                            <tr key={adj._id}>
                              <td><AdjustmentTypeTag type={adj.type} /></td>
                              <td style={{
                                fontWeight: 700,
                                color: adj.type.includes('DEDUCTION') ? '#dc2626' : '#16a34a'
                              }}>
                                {adj.type.includes('DEDUCTION') ? '-' : '+'}£{adj.amount?.toFixed(2)}
                              </td>
                              <td style={{ color: '#334155' }}>{adj.reason}</td>
                              <td style={{ color: '#64748b' }}>{adj.addedByName || adj.addedBy?.name || '—'}</td>
                              {!isFinalized(activeSalary) && (
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                    <button
                                      className="btn btn-outline btn-sm"
                                      style={{ padding: '3px 8px', fontSize: '11px' }}
                                      onClick={() => openEditAdjustment(adj)}
                                    >
                                      <Edit2 size={11} />
                                    </button>
                                    <button
                                      className="btn btn-sm"
                                      style={{ padding: '3px 8px', fontSize: '11px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
                                      onClick={() => handleDeleteAdjustment(adj._id)}
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', padding: '12px' }}>
                        No adjustments added yet.
                      </div>
                    )}

                    {/* Bonus assigned to this week */}
                    {detailData?.bonuses?.length > 0 && (
                      <div style={{ marginTop: '12px', padding: '10px 12px', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
                        <div style={{ fontWeight: 600, fontSize: '11px', color: '#7c3aed', marginBottom: '6px', textTransform: 'uppercase' }}>
                          Monthly Commission Assigned to this Week
                        </div>
                        {detailData.bonuses.map(b => (
                          <div key={b._id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#5b21b6' }}>
                            <span>{b.commitmentText || `${b.bonusPercentage}% of £${b.salesAmount?.toLocaleString()}`} ({b.month} {b.year})</span>
                            <span style={{ fontWeight: 700 }}>+£{b.bonusAmount?.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Final Salary Calculation Breakdown */}
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '16px 18px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ fontWeight: 700, fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>
                        Final Salary Calculation
                      </div>
                      {!isFinalized(activeSalary) && (
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '11px', padding: '3px 10px', color: '#dc2626', borderColor: '#fca5a5' }}
                          onClick={() => openEditDeductionModal(activeSalary)}
                        >
                          <Edit2 size={12} /> Edit Salary Deduction
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Row helper */}
                      {[
                        {
                          icon: <Landmark size={14} color="#0f172a" />,
                          label: 'Net Attendance Pay',
                          value: `£${(activeSalary?.netAttendancePay || 0).toFixed(2)}`,
                          color: '#0f172a'
                        },
                        {
                          icon: <TrendingUp size={14} color="#2563eb" />,
                          label: 'Travel Allowance',
                          value: (activeSalary?.travelAllowance || 0) > 0 ? `+£${activeSalary.travelAllowance.toFixed(2)}` : '+£0.00',
                          color: '#2563eb'
                        },
                        {
                          icon: <TrendingUp size={14} color="#16a34a" />,
                          label: 'Other Allowances',
                          value: (activeSalary?.otherAllowances || 0) > 0 ? `+£${activeSalary.otherAllowances.toFixed(2)}` : '+£0.00',
                          color: '#16a34a'
                        },
                        {
                          icon: <BadgeDollarSign size={14} color="#7c3aed" />,
                          label: 'Monthly Commission',
                          value: (activeSalary?.bonus || 0) > 0 ? `+£${activeSalary.bonus.toFixed(2)}` : '+£0.00',
                          color: '#7c3aed'
                        },
                        {
                          icon: <TrendingDown size={14} color="#dc2626" />,
                          label: 'Other Deductions',
                          value: (activeSalary?.manualDeductions || 0) > 0 ? `-£${activeSalary.manualDeductions.toFixed(2)}` : '-£0.00',
                          color: '#dc2626'
                        }
                      ].map((row, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px dashed #e2e8f0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '13px' }}>
                            {row.icon}
                            <span>{row.label}</span>
                          </div>
                          <span style={{ fontWeight: 600, color: row.color, fontSize: '14px' }}>{row.value}</span>
                        </div>
                      ))}

                      {/* Final total */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: '#0f172a',
                        borderRadius: '8px',
                        marginTop: '6px'
                      }}>
                        <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '14px' }}>= Final Salary</span>
                        <span style={{ color: '#34d399', fontWeight: 800, fontSize: '20px' }}>
                          £{(activeSalary?.finalSalary || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ===== PAYMENT & FINALIZATION STATUS ===== */}
                  <div style={{
                    marginTop: '16px',
                    background: isFinalized(activeSalary) ? '#ecfdf5' : '#f8fafc',
                    border: isFinalized(activeSalary) ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '14px 18px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: isFinalized(activeSalary) ? '#065f46' : '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ShieldCheck size={16} />
                          {isFinalized(activeSalary) ? 'Salary Finalized & Locked' : 'Salary Review / Unfinalized'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          {activeSalary?.finalizedAt ? `Finalized on ${new Date(activeSalary.finalizedAt).toLocaleString('en-GB')}` : 'Ready for Admin Finalization'}
                          {activeSalary?.finalizedByName ? ` by ${activeSalary.finalizedByName}` : ''}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            Paid: <strong style={{ color: '#059669' }}>£{(activeSalary?.totalPaid || 0).toFixed(2)}</strong>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            Outstanding: <strong style={{ color: (activeSalary?.balanceRemaining || 0) > 0 ? '#d97706' : '#059669' }}>
                              £{(activeSalary?.balanceRemaining !== undefined ? activeSalary.balanceRemaining : activeSalary?.finalSalary || 0).toFixed(2)}
                            </strong>
                          </div>
                        </div>
                        <span className={`badge badge-${activeSalary?.status === 'PAID' ? 'paid' : activeSalary?.status === 'PARTIALLY_PAID' ? 'pending' : 'finalized'}`}>
                          {activeSalary?.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ===== PAYMENT DISBURSEMENT HISTORY ===== */}
                  <div style={{
                    marginTop: '16px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '14px 18px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontWeight: 700, fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>
                        Payment Disbursement History
                      </div>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: '11px', padding: '3px 10px', display: 'inline-flex', gap: '4px' }}
                        onClick={() => handleOpenLedger(activeSalary?.employee)}
                      >
                        <Landmark size={12} /> View Employee Ledger
                      </button>
                    </div>

                    {detailData?.payments && detailData.payments.length > 0 ? (
                      <table className="custom-table" style={{ fontSize: '12px', marginBottom: 0 }}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Method</th>
                            <th>Amount</th>
                            <th>Paid By</th>
                            <th>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailData.payments.map(p => (
                            <tr key={p._id}>
                              <td>{new Date(p.paymentDate).toLocaleDateString('en-GB')}</td>
                              <td><span className="badge">{p.paymentMethod}</span></td>
                              <td style={{ fontWeight: 700, color: '#059669' }}>£{p.amount.toFixed(2)}</td>
                              <td>{p.paidByName || p.paidBy?.name || 'Salary Distributor'}</td>
                              <td style={{ color: '#64748b' }}>{p.notes || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', padding: '10px' }}>
                        No payments disbursed yet for this weekly salary.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              {!isFinalized(activeSalary) && !detailLoading && (
                <button
                  className="btn btn-primary"
                  style={{ background: '#0f172a', borderColor: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={handleFinalizeSalary}
                  disabled={finalizing}
                >
                  <Lock size={14} /> {finalizing ? 'Finalizing...' : 'Finalize Salary'}
                </button>
              )}
              <button className="btn btn-outline" onClick={closeDetail}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== EMPLOYEE SALARY LEDGER MODAL ===== */}
      {ledgerModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div className="modal-card" style={{ maxWidth: '780px' }}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Landmark size={18} color="#2563eb" />
                  Employee Salary Ledger: {ledgerEmployee?.name || activeSalary?.employeeName}
                </h2>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Complete audit-proof financial ledger of earned wages &amp; payments disbursed
                </div>
              </div>
              <button onClick={() => setLedgerModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Ledger Summary Stats */}
              {ledgerTotals && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ background: '#eff6ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 600 }}>TOTAL EARNED</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#1d4ed8' }}>£{ledgerTotals.earned?.toFixed(2)}</div>
                  </div>
                  <div style={{ background: '#ecfdf5', padding: '10px 14px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                    <div style={{ fontSize: '11px', color: '#065f46', fontWeight: 600 }}>TOTAL PAID</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#059669' }}>£{ledgerTotals.paid?.toFixed(2)}</div>
                  </div>
                  <div style={{ background: '#fffbeb', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '11px', color: '#92400e', fontWeight: 600 }}>OUTSTANDING BALANCE</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#d97706' }}>£{ledgerTotals.outstanding?.toFixed(2)}</div>
                  </div>
                </div>
              )}

              {ledgerLoading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Loading ledger transactions...</div>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Transaction Description</th>
                        <th>Type</th>
                        <th>Earned (+)</th>
                        <th>Paid (-)</th>
                        <th>Running Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerTransactions.map(t => (
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
                          <td style={{ fontWeight: 700, color: t.runningBalance > 0 ? '#d97706' : '#16a34a', fontSize: '13px' }}>
                            £{t.runningBalance?.toFixed(2)}
                          </td>
                        </tr>
                      ))}

                      {ledgerTransactions.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                            No ledger transactions recorded for this employee.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setLedgerModalOpen(false)}>
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ADD / EDIT ADJUSTMENT MODAL ===== */}
      {adjModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 10001 }}>
          <div className="modal-card" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                {adjEditTarget ? 'Edit Adjustment' : 'Add Adjustment'}
              </h2>
              <button onClick={() => setAdjModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveAdjustment}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Adjustment Type *</label>
                  <select className="form-select" value={adjType} onChange={(e) => setAdjType(e.target.value)} required>
                    {ADJUSTMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Amount (£) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input"
                    placeholder="e.g. 20.00"
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Reason *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Weekly travel allowance, overtime bonus..."
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    required
                  />
                </div>

                {adjAmount && (
                  <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                    <span style={{ color: '#64748b' }}>Effect: </span>
                    <span style={{ fontWeight: 700, color: adjType.includes('DEDUCTION') ? '#dc2626' : '#16a34a' }}>
                      {adjType.includes('DEDUCTION') ? '-' : '+'}£{Number(adjAmount || 0).toFixed(2)}
                    </span>
                    <span style={{ color: '#64748b' }}> to final salary</span>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setAdjModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={adjSaving}>
                  {adjSaving ? 'Saving...' : adjEditTarget ? 'Update Adjustment' : 'Add Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== EDIT WEEKLY SALARY AND DEDUCTION MODAL ===== */}
      {deductionModalOpen && deductionTargetSalary && (
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingDown size={18} color="#dc2626" />
                  Edit Weekly Salary
                </h2>
                <div style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '2px' }}>
                  Worker: <strong>{deductionTargetSalary.employeeName}</strong> • Period: {deductionTargetSalary.weekLabel}
                </div>
              </div>
              <button onClick={() => setDeductionModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} color="#991b1b" />
              </button>
            </div>

            <form onSubmit={handleSaveDeduction}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Summary calculation pill */}
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>Current Weekly Salary:</span>
                    <span style={{ fontWeight: 600 }}>£{(deductionTargetSalary.netAttendancePay || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>Allowances &amp; Commission:</span>
                    <span style={{ fontWeight: 600, color: '#16a34a' }}>
                      +£{((deductionTargetSalary.travelAllowance || 0) + (deductionTargetSalary.otherAllowances || 0) + (deductionTargetSalary.bonus || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, color: '#0f172a' }}>
                    Weekly Salary Amount (£) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    placeholder="Enter weekly salary amount in £"
                    style={{ fontSize: '15px', fontWeight: 700, color: '#2563eb' }}
                    value={weeklySalaryAmountInput}
                    onChange={(e) => setWeeklySalaryAmountInput(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    This sets the base weekly attendance salary before allowances, bonus, and deduction.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, color: '#0f172a' }}>
                    Deduction Amount (£) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    placeholder="Enter deduction amount in £"
                    style={{ fontSize: '15px', fontWeight: 700, color: '#dc2626' }}
                    value={deductionAmountInput}
                    onChange={(e) => setDeductionAmountInput(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    Enter 0 to clear all manual deductions for this worker's weekly salary.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, color: '#0f172a' }}>
                    Reason / Notes for Deduction
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Salary advance, equipment damage, manual adjustment"
                    value={deductionReasonInput}
                    onChange={(e) => setDeductionReasonInput(e.target.value)}
                  />
                </div>

                {/* Live Preview of recalculated final weekly salary */}
                {(() => {
                  const att = Number(weeklySalaryAmountInput) || 0;
                  const allow = (deductionTargetSalary.travelAllowance || 0) + (deductionTargetSalary.otherAllowances || 0) + (deductionTargetSalary.bonus || 0);
                  const ded = Number(deductionAmountInput) || 0;
                  const newFinal = Math.max(0, att + allow - ded);

                  return (
                    <div style={{ background: '#ecfdf5', padding: '12px 14px', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#065f46', textTransform: 'uppercase' }}>New Final Weekly Salary</div>
                        <div style={{ fontSize: '11px', color: '#047857' }}>Calculated dynamically after deduction</div>
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#059669' }}>
                        £{newFinal.toFixed(2)}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setDeductionModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }} disabled={deductionSaving}>
                  {deductionSaving ? 'Saving...' : 'Save Weekly Salary'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
