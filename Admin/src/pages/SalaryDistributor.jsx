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
  Clock
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
    const totalPayable = Number(salary.totalPayable || (weeklySalary + openingBal));
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
        const totalPayable = Number(payModalSalary.totalPayable || (weeklySalary + openingBal));
        setPaymentReceipt(res.data.receipt || {
          employeeName: payModalSalary.employeeName,
          weekLabel: payModalSalary.weekLabel,
          weeklySalary,
          openingBalance: openingBal,
          totalPayable,
          paymentAmount: amount,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          paymentMethod,
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

  const openDetailsModal = async (salary) => {
    setDetailModalSalary(salary);
    try {
      const res = await axios.get(`${API_BASE_URL}/salaries/${salary._id}`);
      if (res.data.success) {
        setSalaryDetails(res.data);
      }
    } catch (err) {
      console.error(err);
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
      <div className="stat-grid" style={{ marginBottom: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
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
        <div className="stat-card" style={{ borderLeft: '4px solid #0284c7' }}>
          <div className="stat-lbl">Total Payable</div>
          <div className="stat-val" style={{ color: '#0284c7' }}>£{metrics.totalPayable?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Weekly Wages + Opening
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
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '14px', color: '#2563eb' }}>
                      £{(s.totalPayable || ((s.finalSalary || 0) + (s.openingBalance || 0))).toFixed(2)}
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
                  <td colSpan="13" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
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
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HandCoins size={18} color="#059669" />
                {payModalSalary.totalPaid > 0 ? 'Pay Remaining Salary' : 'Submit Salary Payment'}: {payModalSalary.employeeName}
              </h2>
              <button
                onClick={() => setPayModalSalary(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleConfirmPayment}>
              <div className="modal-body">
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', marginBottom: '4px', borderTop: '1px dashed #e2e8f0', paddingTop: '4px' }}>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>Total Payable Amount:</span>
                    <strong style={{ color: '#2563eb', fontWeight: 700 }}>£{(payModalSalary.totalPayable || ((payModalSalary.finalSalary || 0) + (payModalSalary.openingBalance || 0))).toFixed(2)}</strong>
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
              <div className="modal-footer">
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

      {/* View Details Modal */}
      {detailModalSalary && salaryDetails && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                Salary Breakdown: {detailModalSalary.employeeName}
              </h2>
              <button
                onClick={() => setDetailModalSalary(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>WORK DAYS</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>{detailModalSalary.workingDays || 0} days</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>DAILY WAGE</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>£{getDailyWage(detailModalSalary).toFixed(2)}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>HOURS WORKED</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>{detailModalSalary.actualHours || 0} hrs</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>NET ATTENDANCE</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>£{detailModalSalary.netAttendancePay?.toFixed(2)}</div>
                </div>
              </div>

              {/* Adjustments */}
              <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#0f172a' }}>Allowances, Bonus & Deductions</div>
                <div style={{ fontSize: '12px', color: '#475569', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  <div>• Travel Allowance: £{detailModalSalary.travelAllowance?.toFixed(2) || '0.00'}</div>
                  <div>• Other Allowances: £{detailModalSalary.otherAllowances?.toFixed(2) || '0.00'}</div>
                  <div style={{ color: '#dc2626' }}>• Manual Deductions: -£{detailModalSalary.manualDeductions?.toFixed(2) || '0.00'}</div>
                  <div style={{ color: '#dc2626' }}>• Late Deductions: -£{detailModalSalary.lateDeductions?.toFixed(2) || '0.00'}</div>
                  <div style={{ color: '#16a34a' }}>• Commission / Bonus: +£{detailModalSalary.bonus?.toFixed(2) || '0.00'}</div>
                  <div style={{ fontWeight: 700, color: '#2563eb' }}>• Final Salary: £{detailModalSalary.finalSalary?.toFixed(2)}</div>
                </div>
              </div>

              {/* Payments History */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Disbursement Payment History</div>
                {salaryDetails.payments?.length > 0 ? (
                  <table className="custom-table" style={{ fontSize: '12px' }}>
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
                      {salaryDetails.payments.map(p => (
                        <tr key={p._id}>
                          <td>{new Date(p.paymentDate).toLocaleDateString('en-GB')}</td>
                          <td>
                            <span className="badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                              {p.paymentMethod}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: '#059669' }}>£{p.amount.toFixed(2)}</td>
                          <td>{p.paidByName}</td>
                          <td style={{ color: '#64748b' }}>{p.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>No payments disbursed yet.</div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDetailModalSalary(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Confirmation Receipt Modal */}
      {paymentReceipt && (
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ background: '#ecfdf5', borderBottom: '1px solid #a7f3d0' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="#059669" /> Payment Confirmation Receipt
              </h2>
              <button onClick={() => setPaymentReceipt(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
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
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => window.print()}>
                Print Receipt
              </button>
              <button className="btn btn-primary" onClick={() => setPaymentReceipt(null)}>
                Done / Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
