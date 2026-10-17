import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import {
  CheckCircle2,
  DollarSign,
  Eye,
  RefreshCw,
  X,
  Filter,
  Calendar,
  Building2,
  Search,
  HandCoins,
  Receipt,
  UserCheck,
  Clock,
  BookOpen,
  Award,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  AlertCircle,
  Edit2,
  Trash2,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';

export default function SalaryDistributor() {
  const [salaries, setSalaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [selectedShop, setSelectedShop] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [shops, setShops] = useState([]);
  const [metrics, setMetrics] = useState({});

  // Pay Modal state
  const [payModalSalary, setPayModalSalary] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  // Detail Modal state
  const [detailModalSalary, setDetailModalSalary] = useState(null);
  const [salaryDetails, setSalaryDetails] = useState(null);
  const [employeeLedger, setEmployeeLedger] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState('ledger'); // 'ledger' or 'breakdown'

  // Edit Payment Modal state
  const [editPaymentModal, setEditPaymentModal] = useState(null);
  const [editPayAmount, setEditPayAmount] = useState('');
  const [editPaymentDate, setEditPaymentDate] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('Cash');
  const [editPayNotes, setEditPayNotes] = useState('');
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  // Receipt Modal state
  const [paymentReceipt, setPaymentReceipt] = useState(null);

  useEffect(() => {
    fetchShops();
  }, []);

  useEffect(() => {
    fetchDistributorData();
  }, [selectedWeek, selectedShop]);

  const fetchShops = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/shops`);
      if (res.data.success) setShops(res.data.shops);
    } catch (err) {
      console.error('Failed to load shops:', err);
    }
  };

  const fetchDistributorData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedWeek && selectedWeek !== 'All') params.weekLabel = selectedWeek;
      if (selectedShop) params.shopId = selectedShop;

      const res = await axios.get(`${API_BASE_URL}/dashboard/distributor`, { params });
      if (res.data.success) {
        setSalaries(res.data.salaries || []);
        setMetrics(res.data.metrics || {});
        if (Array.isArray(res.data.availableWeeks)) {
          setAvailableWeeks(res.data.availableWeeks);
        }
      }
    } catch (err) {
      console.error('Failed to load distributor data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDailyWage = (s) => {
    if (s.employee?.dailyWage) return Number(s.employee.dailyWage);
    if (s.workingDays && s.grossDailyWages) {
      return Number((s.grossDailyWages / s.workingDays).toFixed(2));
    }
    return 0;
  };

  const getTotalDeductions = (s) => {
    return Number(((s.manualDeductions || 0) + (s.lateDeductions || 0)).toFixed(2));
  };

  const openPayModal = (salary) => {
    setPayModalSalary(salary);
    const openingBal = Number(salary.openingBalance || salary.employee?.openingBalance || 0);
    const weeklySalary = Number(salary.weeklySalary || salary.finalSalary || 0);
    const bonus = Number(salary.bonus || 0);
    const totalPayable = Number(salary.totalPayable || (weeklySalary + openingBal + bonus));
    const totalPaid = Number(salary.totalPaid || 0);
    const outstanding = Number(salary.balanceRemaining > 0 ? salary.balanceRemaining : Math.max(0, totalPayable - totalPaid));
    setPayAmount(outstanding > 0 ? outstanding.toFixed(2) : '');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('Cash');
    setPayNotes(`Cash handed over to ${salary.employeeName} at ${salary.shopName}`);
  };

  const handleConfirmPayment = async (e) => {
    e.preventDefault();
    if (!payModalSalary) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(payModalSalary.balanceRemaining || 0)) {
      alert(`Enter an amount between £0.01 and the outstanding £${Number(payModalSalary.balanceRemaining || 0).toFixed(2)}.`);
      return;
    }
    setIsPaying(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/salaries/${payModalSalary._id}/pay`, {
        amount,
        paymentDate,
        paymentMethod,
        notes: payNotes,
        clientReference: `${payModalSalary._id}-${Date.now()}`
      });
      if (res.data.success) {
        const openingBal = Number(payModalSalary.openingBalance || payModalSalary.employee?.openingBalance || 0);
        const weeklySalary = Number(payModalSalary.weeklySalary || payModalSalary.finalSalary || 0);
        const bonus = Number(payModalSalary.bonus || 0);
        const totalPayable = Number(payModalSalary.totalPayable || (weeklySalary + openingBal + bonus));
        const createdPaymentId = res.data.payment?._id || res.data.receipt?.paymentId;
        setPaymentReceipt(res.data.receipt || {
          paymentId: createdPaymentId,
          employeeName: payModalSalary.employeeName,
          weekLabel: payModalSalary.weekLabel,
          weeklySalary,
          openingBalance: openingBal,
          bonus,
          totalPayable,
          paymentAmount: amount,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          paymentMethod,
          notes: payNotes,
          previousPaid: payModalSalary.totalPaid,
          newTotalPaid: (payModalSalary.totalPaid || 0) + amount,
          remainingOutstanding: Math.max(0, (payModalSalary.balanceRemaining || 0) - amount),
          paidByName: 'Arsalan',
          status: Math.max(0, (payModalSalary.balanceRemaining || 0) - amount) === 0 ? 'PAID' : 'PARTIALLY_PAID'
        });
        setPayModalSalary(null);
        fetchDistributorData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Payment recording failed');
    } finally {
      setIsPaying(false);
    }
  };

  const openEditPaymentModal = (payment, salaryContext = null) => {
    const parentSalary = salaryContext || detailModalSalary || salaries.find(s => s._id === (payment.weeklySalary?._id || payment.weeklySalary));
    let rawDate = payment.paymentDate;
    let formattedDate = new Date().toISOString().split('T')[0];
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toISOString().split('T')[0];
      }
    }
    const paymentId = payment._id || payment.paymentId;
    setEditPaymentModal({
      paymentId,
      weeklySalaryId: payment.weeklySalary || parentSalary?._id,
      employeeName: payment.employeeName || parentSalary?.employeeName,
      weekLabel: payment.weekLabel || parentSalary?.weekLabel,
      shopName: payment.shopName || parentSalary?.shopName,
      amount: payment.amount || payment.paymentAmount,
      paymentMethod: payment.paymentMethod || 'Cash',
      paymentDate: formattedDate,
      notes: payment.notes || ''
    });
    setEditPayAmount(String(payment.amount || payment.paymentAmount || ''));
    setEditPaymentDate(formattedDate);
    setEditPaymentMethod(payment.paymentMethod || 'Cash');
    setEditPayNotes(payment.notes || '');
  };

  const handleUpdatePayment = async (e) => {
    e.preventDefault();
    if (!editPaymentModal) return;
    const amount = Number(editPayAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid payment amount greater than £0.');
      return;
    }
    setIsUpdatingPayment(true);
    try {
      const res = await axios.put(`${API_BASE_URL}/salaries/payments/${editPaymentModal.paymentId}`, {
        amount,
        paymentDate: editPaymentDate,
        paymentMethod: editPaymentMethod,
        notes: editPayNotes
      });
      if (res.data.success) {
        alert('Payment updated successfully!');
        const updatedPaymentId = editPaymentModal.paymentId;
        setEditPaymentModal(null);

        // If paymentReceipt was open for this payment, update it
        if (paymentReceipt && (paymentReceipt.paymentId === updatedPaymentId)) {
          setPaymentReceipt(prev => ({
            ...prev,
            paymentAmount: amount,
            paymentDate: editPaymentDate ? new Date(editPaymentDate) : new Date(),
            paymentMethod: editPaymentMethod,
            notes: editPayNotes,
            remainingOutstanding: res.data.salary?.balanceRemaining,
            status: res.data.salary?.status
          }));
        }

        await fetchDistributorData();

        // Refresh details modal if open
        if (detailModalSalary) {
          const empId = detailModalSalary.employee?._id || detailModalSalary.employee;
          const [resDetails, resLedger] = await Promise.allSettled([
            axios.get(`${API_BASE_URL}/salaries/${detailModalSalary._id}`),
            axios.get(`${API_BASE_URL}/salaries/ledger/employee/${empId}`)
          ]);
          if (resDetails.status === 'fulfilled' && resDetails.value.data?.success) {
            setSalaryDetails(resDetails.value.data);
            if (resDetails.value.data.salary) {
              setDetailModalSalary(resDetails.value.data.salary);
            }
          }
          if (resLedger.status === 'fulfilled' && resLedger.value.data?.success) {
            setEmployeeLedger(resLedger.value.data);
          }
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update payment');
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  const handleReversePayment = async (paymentId, amount, empName) => {
    if (!paymentId) return;
    const confirmMsg = `Are you sure you want to reverse / cancel this payout of £${Number(amount || 0).toFixed(2)} for ${empName || 'this worker'}?\n\nThis will remove the payment and restore £${Number(amount || 0).toFixed(2)} back to the worker's remaining balance.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await axios.delete(`${API_BASE_URL}/salaries/payments/${paymentId}`);
      if (res.data.success) {
        alert(res.data.message || 'Payment reversed successfully.');
        if (paymentReceipt && (paymentReceipt.paymentId === paymentId)) {
          setPaymentReceipt(null);
        }
        await fetchDistributorData();

        // Refresh details modal if open
        if (detailModalSalary) {
          const empId = detailModalSalary.employee?._id || detailModalSalary.employee;
          const [resDetails, resLedger] = await Promise.allSettled([
            axios.get(`${API_BASE_URL}/salaries/${detailModalSalary._id}`),
            axios.get(`${API_BASE_URL}/salaries/ledger/employee/${empId}`)
          ]);
          if (resDetails.status === 'fulfilled' && resDetails.value.data?.success) {
            setSalaryDetails(resDetails.value.data);
            if (resDetails.value.data.salary) {
              setDetailModalSalary(resDetails.value.data.salary);
            }
          }
          if (resLedger.status === 'fulfilled' && resLedger.value.data?.success) {
            setEmployeeLedger(resLedger.value.data);
          }
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reverse payment');
    }
  };

  const openDetailsModal = async (salary) => {
    setDetailModalSalary(salary);
    setSalaryDetails(null);
    setEmployeeLedger(null);
    setActiveDetailTab('ledger');
    setLoadingLedger(true);
    try {
      const empId = salary.employee?._id || salary.employee;
      const [resDetails, resLedger] = await Promise.allSettled([
        axios.get(`${API_BASE_URL}/salaries/${salary._id}`),
        axios.get(`${API_BASE_URL}/salaries/ledger/employee/${empId}`)
      ]);
      if (resDetails.status === 'fulfilled' && resDetails.value.data?.success) {
        setSalaryDetails(resDetails.value.data);
      }
      if (resLedger.status === 'fulfilled' && resLedger.value.data?.success) {
        setEmployeeLedger(resLedger.value.data);
      }
    } catch (err) {
      console.error('Failed to load salary details / ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  };

  // Calculate counts for status tabs
  const tabCounts = {
    all: salaries.length,
    awaiting: salaries.filter(s => (s.totalPaid || 0) === 0 && (s.balanceRemaining || 0) > 0).length,
    partial: salaries.filter(s => (s.totalPaid || 0) > 0 && (s.balanceRemaining || 0) > 0).length,
    paid: salaries.filter(s => (s.balanceRemaining || 0) <= 0 || s.status === 'PAID' || s.status === 'Paid').length
  };

  // Filter salaries by status tab and search query (Employee Name or ID)
  const filteredSalaries = salaries.filter(s => {
    if (statusFilter === 'FINALIZED') {
      const isAwaiting = (s.totalPaid || 0) === 0 && (s.balanceRemaining || 0) > 0;
      if (!isAwaiting) return false;
    } else if (statusFilter === 'PARTIALLY_PAID') {
      const isPartial = (s.totalPaid || 0) > 0 && (s.balanceRemaining || 0) > 0;
      if (!isPartial) return false;
    } else if (statusFilter === 'PAID') {
      const isPaid = (s.balanceRemaining || 0) <= 0 || s.status === 'PAID' || s.status === 'Paid';
      if (!isPaid) return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (s.employeeName && s.employeeName.toLowerCase().includes(q)) ||
      (s.employeeId && s.employeeId.toLowerCase().includes(q)) ||
      (s.shopName && s.shopName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Arsalan — Salary Disbursement Dashboard
            </h1>
            <span style={{
              background: '#ecfdf5',
              color: '#059669',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <UserCheck size={12} /> Salary Distributor
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', margin: 0 }}>
            Pay weekly salaries in full or partial installments • Track remaining balances in real-time
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchDistributorData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="stat-grid" style={{ marginBottom: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
          <div className="stat-lbl">Weekly Wages</div>
          <div className="stat-val" style={{ color: '#2563eb' }}>£{metrics.totalWeeklyWages?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Current week attendance
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div className="stat-lbl">Opening Balance (Owed)</div>
          <div className="stat-val" style={{ color: '#7c3aed' }}>£{metrics.totalOpeningBalance?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Previous unpaid balance
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #ec4899' }}>
          <div className="stat-lbl">Commission / Bonus</div>
          <div className="stat-val" style={{ color: '#db2777' }}>£{metrics.totalCommissionBonus?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Approved bonuses
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #0284c7' }}>
          <div className="stat-lbl">Total Payable</div>
          <div className="stat-val" style={{ color: '#0284c7' }}>£{metrics.totalPayable?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Weekly Wages + Opening + Bonus
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="stat-lbl">Disbursed / Paid</div>
          <div className="stat-val" style={{ color: '#059669' }}>£{metrics.totalPaid?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Submitted payouts
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="stat-lbl">Pending Handover</div>
          <div className="stat-val" style={{ color: '#d97706' }}>£{metrics.totalOutstanding?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            {metrics.pendingCount || 0} staff awaiting payout
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ marginBottom: '16px', padding: '14px 18px', background: '#f8fafc', borderColor: '#cbd5e1' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Week Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={15} color="#2563eb" />
            <label className="form-label" style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Week:</label>
            <select
              className="form-select"
              style={{ width: '210px', fontSize: '13px' }}
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
            >
              <option value="">All Finalized Weeks</option>
              {availableWeeks.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>

          {/* Shop Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={15} color="#64748b" />
            <label className="form-label" style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Shop:</label>
            <select
              className="form-select"
              style={{ width: '160px', fontSize: '13px' }}
              value={selectedShop}
              onChange={(e) => setSelectedShop(e.target.value)}
            >
              <option value="">All Shops</option>
              {shops.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>

          {/* Search Input */}
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
        </div>
      </div>

      {/* Interactive Status Tabs */}
      <div style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {[
          { key: 'All', label: 'All Salaries', count: tabCounts.all, color: '#334155', bg: '#f1f5f9' },
          { key: 'FINALIZED', label: 'Awaiting Payment', count: tabCounts.awaiting, color: '#2563eb', bg: '#eff6ff' },
          { key: 'PARTIALLY_PAID', label: 'Partially Paid (Remaining)', count: tabCounts.partial, color: '#d97706', bg: '#fffbeb' },
          { key: 'PAID', label: 'Fully Paid', count: tabCounts.paid, color: '#059669', bg: '#ecfdf5' }
        ].map(tab => {
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: isActive ? `2px solid ${tab.color}` : '1px solid #cbd5e1',
                background: isActive ? tab.bg : '#ffffff',
                color: isActive ? tab.color : '#475569',
                fontWeight: isActive ? 700 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.label}</span>
              <span style={{
                background: isActive ? tab.color : '#e2e8f0',
                color: isActive ? '#ffffff' : '#475569',
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Salaries Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Worker Name</th>
                <th>Shop Location</th>
                <th>Week Period</th>
                <th style={{ textAlign: 'center' }}>Work Days</th>
                <th style={{ textAlign: 'right' }}>Daily Wage</th>
                <th style={{ textAlign: 'right' }}>Deductions</th>
                <th style={{ textAlign: 'right' }}>Weekly Salary</th>
                <th style={{ textAlign: 'right' }}>Opening Balance</th>
                <th style={{ textAlign: 'right' }}>Commission / Bonus</th>
                <th style={{ textAlign: 'right' }}>Total Payable</th>
                <th style={{ textAlign: 'right' }}>Paid</th>
                <th style={{ textAlign: 'right' }}>Remaining Balance</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSalaries.map(s => {
                const dailyWage = getDailyWage(s);
                const totalDeductions = getTotalDeductions(s);
                const isPaid = (s.balanceRemaining || 0) <= 0 || s.status === 'PAID' || s.status === 'Paid';
                const isPartial = (s.totalPaid || 0) > 0 && (s.balanceRemaining || 0) > 0;

                return (
                  <tr key={s._id} style={{ background: isPaid ? '#fcfdfd' : isPartial ? '#fffdfa' : '#ffffff' }}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>
                        {s.employeeName}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {s.employeeId}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500, color: '#334155' }}>
                        {s.shopName}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: '#475569' }}>
                      {s.weekLabel}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '12px'
                      }}>
                        {s.workingDays || 0}d
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                      £{dailyWage.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {totalDeductions > 0 ? (
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>
                          -£{totalDeductions.toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>£0.00</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                      £{(s.weeklySalary || s.finalSalary || 0).toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {(s.openingBalance || 0) > 0 ? (
                        <span style={{ color: '#7c3aed', fontWeight: 600, fontSize: '13px' }}>
                          +£{(s.openingBalance || 0).toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>£0.00</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {(s.bonus || 0) > 0 ? (
                        <span style={{ color: '#db2777', fontWeight: 600, fontSize: '13px' }}>
                          +£{(s.bonus || 0).toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>£0.00</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '14px', color: '#2563eb' }}>
                      £{(s.totalPayable || ((s.finalSalary || 0) + (s.openingBalance || 0) + (s.bonus || 0))).toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {(s.totalPaid || 0) > 0 ? (
                        <span style={{ color: '#059669', fontWeight: 700 }}>
                          £{s.totalPaid.toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>£0.00</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {s.balanceRemaining > 0 ? (
                        <div>
                          <span style={{
                            fontWeight: 700,
                            color: isPartial ? '#d97706' : '#b45309',
                            fontSize: '14px'
                          }}>
                            £{(s.balanceRemaining || 0).toFixed(2)}
                          </span>
                          {isPartial && (
                            <div style={{ fontSize: '10.5px', color: '#d97706', fontWeight: 600 }}>
                              remaining
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#059669', fontWeight: 700, fontSize: '13px' }}>
                          £0.00
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isPaid ? (
                        <span style={{
                          background: '#ecfdf5',
                          color: '#059669',
                          border: '1px solid #a7f3d0',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <CheckCircle2 size={12} /> Paid
                        </span>
                      ) : isPartial ? (
                        <span style={{
                          background: '#fffbeb',
                          color: '#b45309',
                          border: '1px solid #fde68a',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Clock size={12} /> Partially Paid
                        </span>
                      ) : (
                        <span style={{
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600
                        }}>
                          Awaiting Payment
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openDetailsModal(s)}
                          title="View complete breakdown & payment history"
                          style={{ padding: '5px 8px', fontSize: '12px' }}
                        >
                          <Eye size={13} /> Details
                        </button>

                        {s.balanceRemaining > 0 ? (
                          <button
                            className="btn btn-sm"
                            onClick={() => openPayModal(s)}
                            style={{
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '5px 12px',
                              background: isPartial ? '#d97706' : '#059669',
                              borderColor: isPartial ? '#b45309' : '#047857',
                              color: '#ffffff'
                            }}
                            title={isPartial ? 'Pay remaining balance to worker' : 'Submit payment when giving salary to worker'}
                          >
                            <HandCoins size={14} />
                            {isPartial ? `Pay Remaining (£${s.balanceRemaining.toFixed(2)})` : 'Pay Salary'}
                          </button>
                        ) : (
                          <span style={{
                            fontSize: '12px',
                            color: '#16a34a',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            background: '#ecfdf5',
                            borderRadius: '6px'
                          }}>
                            <CheckCircle2 size={13} /> Paid
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredSalaries.length === 0 && !loading && (
                <tr>
                  <td colSpan="14" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                    No finalized salary records found matching current criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay Modal ("Submit Payment") */}
      {payModalSalary && (
        <div className="modal-overlay" style={{ zIndex: 10000, overflowY: 'auto', padding: '16px' }}>
          <div className="modal-card" style={{ maxWidth: '540px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header" style={{ flexShrink: 0, borderBottom: '1px solid #e2e8f0', padding: '14px 18px', background: '#f8fafc' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HandCoins size={18} color="#059669" />
                {payModalSalary.totalPaid > 0 ? 'Pay Remaining Salary' : 'Submit Salary Payment'}: {payModalSalary.employeeName}
              </h2>
              <button
                onClick={() => setPayModalSalary(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleConfirmPayment} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', margin: 0 }}>
              <div className="modal-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '18px 20px' }}>
                {/* Worker summary banner */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px 18px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', marginBottom: '8px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Shop: </span>
                      <strong>{payModalSalary.shopName}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Period: </span>
                      <strong>{payModalSalary.weekLabel}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '10px', fontSize: '12px' }}>
                    <div>
                      <div style={{ color: '#64748b' }}>Work Days</div>
                      <strong style={{ fontSize: '13px' }}>{payModalSalary.workingDays || 0} days</strong>
                    </div>
                    <div>
                      <div style={{ color: '#64748b' }}>Daily Wage</div>
                      <strong style={{ fontSize: '13px' }}>£{getDailyWage(payModalSalary).toFixed(2)}</strong>
                    </div>
                    <div>
                      <div style={{ color: '#64748b' }}>Deductions</div>
                      <strong style={{ fontSize: '13px', color: getTotalDeductions(payModalSalary) > 0 ? '#dc2626' : '#64748b' }}>
                        -£{getTotalDeductions(payModalSalary).toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>Weekly Salary:</span>
                    <strong style={{ color: '#0f172a' }}>£{(payModalSalary.weeklySalary || payModalSalary.finalSalary || 0).toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>Opening Balance (Owed):</span>
                    <strong style={{ color: '#7c3aed' }}>+£{(payModalSalary.openingBalance || 0).toFixed(2)}</strong>
                  </div>
                  {(payModalSalary.bonus || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                      <span style={{ color: '#64748b' }}>Commission / Bonus:</span>
                      <strong style={{ color: '#db2777' }}>+£{(payModalSalary.bonus || 0).toFixed(2)}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', marginBottom: '4px', borderTop: '1px dashed #e2e8f0', paddingTop: '4px' }}>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>Total Payable Amount:</span>
                    <strong style={{ color: '#2563eb', fontWeight: 700 }}>£{(payModalSalary.totalPayable || ((payModalSalary.finalSalary || 0) + (payModalSalary.openingBalance || 0) + (payModalSalary.bonus || 0))).toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>Already Paid:</span>
                    <span style={{ color: '#059669', fontWeight: 600 }}>£{(payModalSalary.totalPaid || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', borderTop: '1px solid #cbd5e1', paddingTop: '8px', marginTop: '6px' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>Outstanding Balance:</span>
                    <strong style={{ color: '#d97706', fontSize: '17px' }}>
                      £{(payModalSalary.balanceRemaining || 0).toFixed(2)}
                    </strong>
                  </div>
                </div>

                {/* Payment Date Selection */}
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={15} color="#2563eb" /> Payment Date
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ fontSize: '14px' }}
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    Select the date when this payment was handed over or transferred.
                  </div>
                </div>

                {/* Amount to Submit with Quick Buttons */}
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Amount to Submit (£)</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        onClick={() => setPayAmount(payModalSalary.balanceRemaining?.toFixed(2))}
                        style={{ fontSize: '11px', padding: '3px 8px', background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe', fontWeight: 600 }}
                      >
                        Pay Full (£{payModalSalary.balanceRemaining?.toFixed(2)})
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        onClick={() => setPayAmount((payModalSalary.balanceRemaining / 2).toFixed(2))}
                        style={{ fontSize: '11px', padding: '3px 8px', background: '#fffbeb', color: '#d97706', borderColor: '#fde68a', fontWeight: 600 }}
                      >
                        Pay Half (£{(payModalSalary.balanceRemaining / 2).toFixed(2)})
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={payModalSalary.balanceRemaining}
                    className="form-input"
                    style={{ fontSize: '16px', fontWeight: 700, color: '#059669' }}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    You can pay full, half, or any custom partial amount now and pay the remaining balance later.
                  </div>
                </div>

                {/* Payment Method */}
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Payment Method</label>
                  <select
                    className="form-select"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">Cash Handover</option>
                    <option value="Bank">Bank Transfer</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Notes / Remarks (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Paid half salary, remaining will be given later"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                  />
                </div>

                {/* Live Balance Preview Calculation */}
                {payAmount && (
                  <div style={{
                    background: Math.max(0, Number(payModalSalary.balanceRemaining || 0) - Number(payAmount || 0)) > 0 ? '#fffbeb' : '#ecfdf5',
                    border: `1px solid ${Math.max(0, Number(payModalSalary.balanceRemaining || 0) - Number(payAmount || 0)) > 0 ? '#fde68a' : '#a7f3d0'}`,
                    padding: '12px 16px',
                    borderRadius: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#475569' }}>Submitting Payout ({paymentDate}):</span>
                      <strong style={{ color: '#059669' }}>£{Number(payAmount || 0).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '6px', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }}>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>Remaining Balance After Payment:</span>
                      <strong style={{
                        fontSize: '15px',
                        color: Math.max(0, Number(payModalSalary.balanceRemaining || 0) - Number(payAmount || 0)) > 0 ? '#d97706' : '#059669'
                      }}>
                        £{Math.max(0, Number(payModalSalary.balanceRemaining || 0) - Number(payAmount || 0)).toFixed(2)}
                      </strong>
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '6px', color: Math.max(0, Number(payModalSalary.balanceRemaining || 0) - Number(payAmount || 0)) > 0 ? '#b45309' : '#047857' }}>
                      {Math.max(0, Number(payModalSalary.balanceRemaining || 0) - Number(payAmount || 0)) > 0
                        ? `ℹ️ Worker will have £${Math.max(0, Number(payModalSalary.balanceRemaining || 0) - Number(payAmount || 0)).toFixed(2)} remaining. You can pay the remaining amount at another time.`
                        : '✓ Entire salary cleared! Status will be marked as FULLY PAID.'}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ flexShrink: 0, background: '#ffffff', borderTop: '1px solid #e2e8f0', padding: '14px 20px', position: 'sticky', bottom: 0, zIndex: 10, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setPayModalSalary(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-success btn-lg" disabled={isPaying} style={{ fontWeight: 700 }}>
                  {isPaying ? 'Submitting...' : Math.max(0, Number(payModalSalary.balanceRemaining || 0) - Number(payAmount || 0)) > 0 ? `Submit Partial Payment (£${Number(payAmount || 0).toFixed(2)})` : `Submit Full Payment (£${Number(payAmount || 0).toFixed(2)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Details Modal ("Salary Breakdown & Full Worker Ledger") */}
      {detailModalSalary && (
        <div className="modal-overlay" style={{ zIndex: 10001 }}>
          <div className="modal-card" style={{ maxWidth: '880px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700
                }}>
                  <BookOpen size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    {detailModalSalary.employeeName}
                  </h2>
                  <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                    <span>ID: <strong>{detailModalSalary.employeeId}</strong></span>
                    <span>•</span>
                    <span>Shop: <strong>{detailModalSalary.shopName}</strong></span>
                    <span>•</span>
                    <span>Week: <strong>{detailModalSalary.weekLabel}</strong></span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDetailModalSalary(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div style={{
              display: 'flex',
              gap: '12px',
              padding: '10px 20px',
              background: '#ffffff',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <button
                type="button"
                onClick={() => setActiveDetailTab('ledger')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeDetailTab === 'ledger' ? '#eff6ff' : 'transparent',
                  color: activeDetailTab === 'ledger' ? '#2563eb' : '#64748b',
                  fontWeight: activeDetailTab === 'ledger' ? 700 : 500,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  borderBottom: activeDetailTab === 'ledger' ? '2px solid #2563eb' : '2px solid transparent'
                }}
              >
                <BookOpen size={15} />
                <span>Full Worker Ledger Statement</span>
                {employeeLedger?.transactions?.length > 0 && (
                  <span style={{
                    background: activeDetailTab === 'ledger' ? '#2563eb' : '#e2e8f0',
                    color: activeDetailTab === 'ledger' ? '#ffffff' : '#475569',
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontWeight: 700
                  }}>
                    {employeeLedger.transactions.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('breakdown')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeDetailTab === 'breakdown' ? '#eff6ff' : 'transparent',
                  color: activeDetailTab === 'breakdown' ? '#2563eb' : '#64748b',
                  fontWeight: activeDetailTab === 'breakdown' ? 700 : 500,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  borderBottom: activeDetailTab === 'breakdown' ? '2px solid #2563eb' : '2px solid transparent'
                }}
              >
                <FileText size={15} />
                <span>Week Salary Breakdown</span>
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {loadingLedger && !employeeLedger && !salaryDetails ? (
                <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                  <RefreshCw size={24} className="spin" style={{ marginBottom: '10px' }} />
                  <div>Loading worker details and complete ledger statement...</div>
                </div>
              ) : activeDetailTab === 'ledger' ? (
                /* TAB 1: FULL WORKER LEDGER */
                <div>
                  {/* Ledger Metrics Summary */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '12px',
                    marginBottom: '16px'
                  }}>
                    <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>Opening Balance (Owed)</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#6d28d9', marginTop: '2px' }}>
                        £{(employeeLedger?.summary?.openingBalance || detailModalSalary.openingBalance || 0).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#7c3aed', marginTop: '3px' }}>Carried forward</div>
                    </div>

                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>Total Earned</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e40af', marginTop: '2px' }}>
                        £{(employeeLedger?.summary?.totalEarned || 0).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '3px' }}>Wages + Commissions</div>
                    </div>

                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>Total Disbursed / Paid</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#047857', marginTop: '2px' }}>
                        £{(employeeLedger?.summary?.totalPaid || 0).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#10b981', marginTop: '3px' }}>Cash & bank handovers</div>
                    </div>

                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>Current Balance Owed</div>
                      <div style={{
                        fontSize: '18px',
                        fontWeight: 800,
                        color: (employeeLedger?.summary?.outstanding || 0) > 0 ? '#b45309' : '#059669',
                        marginTop: '2px'
                      }}>
                        £{(employeeLedger?.summary?.outstanding || 0).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#d97706', marginTop: '3px' }}>Remaining payable</div>
                    </div>
                  </div>

                  {/* Ledger Information Banner */}
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12px',
                    color: '#475569',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Info size={16} color="#2563eb" style={{ flexShrink: 0 }} />
                    <span>
                      System ledger active from <strong>11 October 2026</strong>. Includes weekly salaries, approved monthly bonuses, and payouts.
                    </span>
                  </div>

                  {/* Transactions Table */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <BookOpen size={15} color="#2563eb" /> Full Ledger Transaction Statement
                    </div>
                    {employeeLedger?.transactions?.length > 0 ? (
                      <div className="table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <table className="custom-table" style={{ fontSize: '12px', margin: 0 }}>
                          <thead>
                            <tr style={{ background: '#f8fafc' }}>
                              <th>Date</th>
                              <th>Type</th>
                              <th>Description</th>
                              <th style={{ textAlign: 'right' }}>Earned / Credit</th>
                              <th style={{ textAlign: 'right' }}>Paid / Debit</th>
                              <th style={{ textAlign: 'right' }}>Remaining Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {employeeLedger.transactions.map((tx, idx) => {
                              const isOpening = tx.transactionType === 'OPENING_BALANCE';
                              const isBonus = tx.transactionType === 'BONUS_CREDIT';
                              const isSalary = tx.transactionType === 'WEEKLY_SALARY' || tx.transactionType === 'SALARY_EARNED';
                              const isPayment = tx.transactionType === 'SALARY_PAYMENT';
                              const isWageAdjustment = tx.transactionType === 'WAGE_INCREASE' || tx.transactionType === 'WAGE_ADJUSTMENT' || tx.transactionType === 'WAGE_CHANGE';

                              return (
                                <tr key={tx._id || idx}>
                                  <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                                    {new Date(tx.date).toLocaleDateString('en-GB')}
                                  </td>
                                  <td>
                                    {isOpening && (
                                      <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                                        Opening Bal
                                      </span>
                                    )}
                                    {isBonus && (
                                      <span style={{ background: '#fdf2f8', color: '#db2777', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                                        Bonus / Comm
                                      </span>
                                    )}
                                    {isSalary && (
                                      <span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                                        Weekly Salary
                                      </span>
                                    )}
                                    {isPayment && (
                                      <span style={{ background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                                        Salary Payout
                                      </span>
                                    )}
                                    {isWageAdjustment && (
                                      <span style={{ background: '#fffbeb', color: '#b45309', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                                        Wage Increase
                                      </span>
                                    )}
                                    {!isOpening && !isBonus && !isSalary && !isPayment && !isWageAdjustment && (
                                      <span className="badge badge-pending">
                                        {tx.transactionType}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ color: '#334155' }}>
                                    {tx.description}
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                    {tx.amountEarned > 0 ? (
                                      <span style={{ color: isBonus ? '#db2777' : '#1d4ed8' }}>
                                        +£{tx.amountEarned.toFixed(2)}
                                      </span>
                                    ) : (
                                      <span style={{ color: '#94a3b8' }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                    {tx.amountPaid > 0 ? (
                                      <span style={{ color: '#dc2626' }}>
                                        -£{tx.amountPaid.toFixed(2)}
                                      </span>
                                    ) : (
                                      <span style={{ color: '#94a3b8' }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                                    £{Number(tx.runningBalance || 0).toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '24px', background: '#f8fafc', borderRadius: '8px', color: '#94a3b8', fontSize: '13px' }}>
                        No ledger transactions found starting from 11 October 2026.
                      </div>
                    )}
                  </div>

                  {/* Payment Disbursements List */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <HandCoins size={15} color="#059669" /> Recorded Payout Receipts
                    </div>
                    {salaryDetails?.payments?.length > 0 ? (
                      <div className="table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <table className="custom-table" style={{ fontSize: '12px', margin: 0 }}>
                          <thead>
                            <tr style={{ background: '#f8fafc' }}>
                              <th>Date</th>
                              <th>Method</th>
                              <th style={{ textAlign: 'right' }}>Amount Paid</th>
                              <th>Paid By</th>
                              <th>Notes / Handover Details</th>
                              <th style={{ textAlign: 'right' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {salaryDetails.payments.map(p => (
                              <tr key={p._id}>
                                <td>{new Date(p.paymentDate).toLocaleDateString('en-GB')}</td>
                                <td>
                                  <span style={{
                                    background: p.paymentMethod === 'Cash' ? '#ecfdf5' : '#eff6ff',
                                    color: p.paymentMethod === 'Cash' ? '#059669' : '#2563eb',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    fontWeight: 600,
                                    fontSize: '11px'
                                  }}>
                                    {p.paymentMethod} Handover
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669', fontSize: '13px' }}>
                                  £{p.amount.toFixed(2)}
                                </td>
                                <td style={{ fontWeight: 500 }}>{p.paidByName}</td>
                                <td style={{ color: '#64748b' }}>{p.notes || '—'}</td>
                                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                    <button
                                      type="button"
                                      className="btn btn-outline btn-xs"
                                      onClick={() => openEditPaymentModal(p, detailModalSalary)}
                                      title="Edit payout date, amount, method, or notes"
                                      style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2563eb', borderColor: '#bfdbfe' }}
                                    >
                                      <Edit2 size={12} /> Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-outline btn-xs"
                                      onClick={() => handleReversePayment(p._id, p.amount, detailModalSalary?.employeeName)}
                                      title="Reverse / delete this payment and restore balance"
                                      style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#dc2626', borderColor: '#fecaca' }}
                                    >
                                      <RotateCcw size={12} /> Reverse
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#94a3b8', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                        No payments recorded for this salary period yet.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* TAB 2: CURRENT WEEK BREAKDOWN */
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>WORK DAYS</div>
                      <div style={{ fontSize: '16px', fontWeight: 700 }}>{detailModalSalary.workingDays || 0} days</div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>DAILY WAGE</div>
                      <div style={{ fontSize: '16px', fontWeight: 700 }}>£{getDailyWage(detailModalSalary).toFixed(2)}</div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>HOURS WORKED</div>
                      <div style={{ fontSize: '16px', fontWeight: 700 }}>{detailModalSalary.actualHours || 0} hrs</div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>NET ATTENDANCE</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#2563eb' }}>£{detailModalSalary.netAttendancePay?.toFixed(2) || (detailModalSalary.finalSalary || 0).toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Adjustments & Formulas */}
                  <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '14px 18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: '#0f172a' }}>Allowances, Deductions & Formula Breakdown</div>
                    <div style={{ fontSize: '12.5px', color: '#334155', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <div>• Travel Allowance: £{detailModalSalary.travelAllowance?.toFixed(2) || '0.00'}</div>
                      <div>• Other Allowances: £{detailModalSalary.otherAllowances?.toFixed(2) || '0.00'}</div>
                      <div style={{ color: '#dc2626' }}>• Manual Deductions: -£{detailModalSalary.manualDeductions?.toFixed(2) || '0.00'}</div>
                      <div style={{ color: '#dc2626' }}>• Late Deductions: -£{detailModalSalary.lateDeductions?.toFixed(2) || '0.00'}</div>
                      <div style={{ color: '#db2777', fontWeight: 600 }}>• Commission / Bonus: +£{Number(detailModalSalary.bonus || 0).toFixed(2)}</div>
                      <div style={{ color: '#7c3aed', fontWeight: 600 }}>• Opening Balance (Owed): +£{Number(detailModalSalary.openingBalance || 0).toFixed(2)}</div>
                    </div>
                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700 }}>
                      <span style={{ color: '#0f172a' }}>Total Payable for Handover:</span>
                      <span style={{ color: '#2563eb' }}>
                        £{(detailModalSalary.totalPayable || ((detailModalSalary.finalSalary || 0) + (detailModalSalary.openingBalance || 0) + (detailModalSalary.bonus || 0))).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Attendance Log Table */}
                  {salaryDetails?.attendances?.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                        Daily Attendance Shifts
                      </div>
                      <div className="table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <table className="custom-table" style={{ fontSize: '12px', margin: 0 }}>
                          <thead>
                            <tr style={{ background: '#f8fafc' }}>
                              <th>Date</th>
                              <th>Day</th>
                              <th>Shift Scheduled</th>
                              <th>Actual Hours</th>
                              <th style={{ textAlign: 'right' }}>Daily Pay</th>
                            </tr>
                          </thead>
                          <tbody>
                            {salaryDetails.attendances.map(att => (
                              <tr key={att._id}>
                                <td>{new Date(att.date).toLocaleDateString('en-GB')}</td>
                                <td>{att.dayOfWeek || new Date(att.date).toLocaleDateString('en-GB', { weekday: 'short' })}</td>
                                <td>{att.scheduledShift || 'Standard Shift'}</td>
                                <td>{att.actualHours || att.hoursWorked || 0} hrs</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>£{Number(att.dailyPay || getDailyWage(detailModalSalary)).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '12px 20px', background: '#f8fafc' }}>
              <button className="btn btn-primary" onClick={() => setDetailModalSalary(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Confirmation Receipt Modal */}
      {paymentReceipt && (
        <div className="modal-overlay" style={{ zIndex: 10002, overflowY: 'auto', padding: '16px' }}>
          <div className="modal-card" style={{ maxWidth: '480px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header" style={{ flexShrink: 0, background: '#ecfdf5', borderBottom: '1px solid #a7f3d0' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="#059669" /> Payment Confirmation Receipt
              </h2>
              <button onClick={() => setPaymentReceipt(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '20px' }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>AMOUNT DISBURSED</div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#059669' }}>
                  £{paymentReceipt.paymentAmount?.toFixed(2)}
                </div>
                <span className={`badge badge-${paymentReceipt.status === 'PAID' ? 'paid' : 'pending'}`}>
                  {paymentReceipt.status}
                </span>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Worker:</span>
                  <strong>{paymentReceipt.employeeName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Salary Week:</span>
                  <span>{paymentReceipt.weekLabel}</span>
                </div>
                {paymentReceipt.weeklySalary !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Weekly Salary:</span>
                    <span>£{paymentReceipt.weeklySalary?.toFixed(2)}</span>
                  </div>
                )}
                {Boolean(paymentReceipt.openingBalance) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Opening Balance (Owed):</span>
                    <span style={{ color: '#7c3aed' }}>+£{paymentReceipt.openingBalance?.toFixed(2)}</span>
                  </div>
                )}
                {Boolean(paymentReceipt.bonus) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Commission / Bonus:</span>
                    <span style={{ color: '#db2777' }}>+£{paymentReceipt.bonus?.toFixed(2)}</span>
                  </div>
                )}
                {paymentReceipt.totalPayable !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Total Payable:</span>
                    <strong style={{ color: '#2563eb' }}>£{paymentReceipt.totalPayable?.toFixed(2)}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Payment Date:</span>
                  <span>{new Date(paymentReceipt.paymentDate).toLocaleString('en-GB')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Method:</span>
                  <strong>{paymentReceipt.paymentMethod}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Previous Paid:</span>
                  <span>£{paymentReceipt.previousPaid?.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>New Total Paid:</span>
                  <strong style={{ color: '#059669' }}>£{paymentReceipt.newTotalPaid?.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                  <span style={{ fontWeight: 600 }}>Remaining Outstanding:</span>
                  <strong style={{ color: (paymentReceipt.remainingOutstanding || 0) > 0 ? '#d97706' : '#059669' }}>
                    £{paymentReceipt.remainingOutstanding?.toFixed(2)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Disbursed By:</span>
                  <strong>{paymentReceipt.paidByName}</strong>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ flexShrink: 0, background: '#ffffff', position: 'sticky', bottom: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {paymentReceipt.paymentId && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => openEditPaymentModal(paymentReceipt)}
                      style={{ color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff', display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}
                    >
                      <Edit2 size={13} /> Edit Payout
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => handleReversePayment(paymentReceipt.paymentId, paymentReceipt.paymentAmount, paymentReceipt.employeeName)}
                      style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2', display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}
                    >
                      <RotateCcw size={13} /> Reverse / Undo
                    </button>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
                  Print Receipt
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setPaymentReceipt(null)}>
                  Done / Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editPaymentModal && (
        <div className="modal-overlay" style={{ zIndex: 10005, overflowY: 'auto', padding: '16px' }}>
          <div className="modal-card" style={{ maxWidth: '480px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header" style={{ flexShrink: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit2 size={18} color="#2563eb" /> Edit Salary Payout: {editPaymentModal.employeeName}
              </h2>
              <button
                onClick={() => setEditPaymentModal(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdatePayment} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', margin: 0 }}>
              <div className="modal-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '20px' }}>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12.5px', color: '#1e40af' }}>
                  Modify the payment date, amount, method, or notes. The salary balance and worker ledger will automatically recalculate.
                </div>

                {/* Payment Date */}
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={15} color="#2563eb" /> Payment Date
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={editPaymentDate}
                    onChange={(e) => setEditPaymentDate(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    Correct the date this payout took place.
                  </div>
                </div>

                {/* Amount */}
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Amount Paid (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input"
                    style={{ fontSize: '16px', fontWeight: 700, color: '#059669' }}
                    value={editPayAmount}
                    onChange={(e) => setEditPayAmount(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    Adjust the cash or bank amount given.
                  </div>
                </div>

                {/* Payment Method */}
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Payment Method</label>
                  <select
                    className="form-select"
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">Cash Handover</option>
                    <option value="Bank">Bank Transfer</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Notes / Remarks (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Corrected cash amount from £50 to £100"
                    value={editPayNotes}
                    onChange={(e) => setEditPayNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ flexShrink: 0, background: '#ffffff', position: 'sticky', bottom: 0, zIndex: 10, borderTop: '1px solid #e2e8f0', padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditPaymentModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isUpdatingPayment} style={{ fontWeight: 700 }}>
                  {isUpdatingPayment ? 'Saving...' : 'Save & Update Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
