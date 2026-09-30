import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import {
  Users, Store, Clock, AlertCircle, Banknote, Award, ArrowUpRight,
  TrendingUp, BarChart2, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Module-level cache — survives React navigation (component unmount/remount)
// Data is kept until the page is fully refreshed in the browser
const _cache = { data: null, summaryData: null, fetchedAt: null };
const CACHE_TTL_MS = 5 * 60 * 1000; // Re-fetch in background after 5 minutes

export default function AdminDashboard() {
  // Initialise from cache so there is NO loading flash on revisit
  const [data, setData]             = useState(_cache.data);
  const [summaryData, setSummaryData] = useState(_cache.summaryData);
  const [loading, setLoading]       = useState(!_cache.data); // false if already cached
  const [error, setError]           = useState('');
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const cacheAge = _cache.fetchedAt ? Date.now() - _cache.fetchedAt : Infinity;
    const needsFresh = cacheAge > CACHE_TTL_MS;

    if (_cache.data && !needsFresh) {
      // Cache is fresh — nothing to do, data already shown instantly
      return;
    }

    // First load or stale cache: fetch (silently if we already have cached data)
    fetchDashboard(/* silent = */ !!_cache.data);

    return () => { isMounted.current = false; };
  }, []);

  const fetchDashboard = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [dashRes, sumRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/dashboard/admin`),
        axios.get(`${API_BASE_URL}/reports/summary`)
      ]);
      if (!isMounted.current) return; // navigated away — discard
      const newData        = dashRes.data.success ? dashRes.data.data : _cache.data;
      const newSummaryData = sumRes.data.success  ? sumRes.data       : _cache.summaryData;
      // Update cache
      _cache.data        = newData;
      _cache.summaryData = newSummaryData;
      _cache.fetchedAt   = Date.now();
      setData(newData);
      setSummaryData(newSummaryData);
    } catch (err) {
      if (!isMounted.current) return;
      console.error('Failed to load dashboard:', err);
      // Only show error when we have no data at all
      if (!_cache.data) {
        setError('Unable to load executive dashboard data. Please check connection and try again.');
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container" aria-busy="true">
        <div style={{ marginBottom: '24px' }}>
          <div className="skeleton skeleton-title" style={{ width: '220px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '300px' }}></div>
        </div>
        <div className="stat-grid" style={{ marginBottom: '24px' }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="skeleton skeleton-card" style={{ height: '95px' }}></div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div className="skeleton skeleton-card" style={{ height: '260px' }}></div>
          <div className="skeleton skeleton-card" style={{ height: '260px' }}></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="error-state">
          <div className="error-state-title">Dashboard Loading Error</div>
          <div className="error-state-desc">{error}</div>
          <button className="btn btn-primary btn-sm" onClick={() => fetchDashboard(false)}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const {
    totalEmployees = 0,
    activeEmployees = 0,
    totalShops = 0,
    pendingAttendanceCount = 0,
    attendanceStats = {},
    weekLabel = '',
    thisWeekSalaryTotal = 0,
    thisWeekPaidTotal = 0,
    thisWeekOutstanding = 0,
    monthlyBonusTotal = 0,
    shopBreakdown = []
  } = data || {};

  const cards = summaryData?.cards || {};
  const charts = summaryData?.charts || {};

  return (
    <div className="page-container">
      {/* Title & Quick Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
            Executive Dashboard
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0 0' }}>
            PixxTechnologies UK Rota, Attendance & Labour Economics
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/attendance-checker" className="btn btn-outline btn-sm">
            Pending Attendance ({pendingAttendanceCount})
          </Link>
          <Link to="/salaries" className="btn btn-outline btn-sm">
            Manage Salaries
          </Link>
          <Link to="/reports" className="btn btn-primary btn-sm">
            Reports & Analytics
          </Link>
        </div>
      </div>

      {/* Section 19: Comprehensive Management Summary Cards */}
      <div className="stat-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
          <div className="stat-lbl">Finalized Salary</div>
          <div className="stat-val" style={{ color: '#2563eb' }}>
            £{(cards.finalizedSalary || thisWeekSalaryTotal || 0).toFixed(2)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Week: {weekLabel}
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="stat-lbl">Salary Paid</div>
          <div className="stat-val" style={{ color: '#059669' }}>
            £{(cards.totalPaid || thisWeekPaidTotal || 0).toFixed(2)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Disbursed wages
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="stat-lbl">Outstanding Balance</div>
          <div className="stat-val" style={{ color: '#dc2626' }}>
            £{(cards.outstanding || thisWeekOutstanding || 0).toFixed(2)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Remaining salary liability
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-lbl">Active Workforce</div>
          <div className="stat-val">{cards.activeEmployees || activeEmployees}</div>
          <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
            {totalEmployees} Total Registered
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-lbl">Labour Hours</div>
          <div className="stat-val">{Number(cards.labourHours || attendanceStats.totalHours || 0).toFixed(1)}h</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Actual worked hours
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-lbl">Net Attendance Pay</div>
          <div className="stat-val">£{Number(cards.attendancePay || attendanceStats.totalWages || 0).toFixed(2)}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Direct shift earnings
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-lbl">Monthly Bonuses</div>
          <div className="stat-val">£{Number(cards.bonuses || monthlyBonusTotal || 0).toFixed(2)}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Sales Commissions
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-lbl">Allowances & Ded</div>
          <div className="stat-val">£{Number(cards.allowances || 0).toFixed(2)}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Deductions: £{Number(cards.deductions || 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Section 20: Visual Analytics & Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {/* Chart 1: Salary by Shop */}
        <div className="card">
          <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px 0', color: '#1e293b' }}>
            Salary Cost by Shop Location (£)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {charts.salaryByShop?.map(s => {
              const maxVal = Math.max(...charts.salaryByShop.map(i => i.amount), 1);
              const pct = Math.min(100, Math.round((s.amount / maxVal) * 100));
              return (
                <div key={s.shopId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600 }}>{s.shopName}</span>
                    <span style={{ fontWeight: 700, color: '#2563eb' }}>£{s.amount.toFixed(2)}</span>
                  </div>
                  <div style={{ background: '#f1f5f9', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ background: '#2563eb', height: '100%', width: `${pct}%`, transition: 'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
            {(!charts.salaryByShop || charts.salaryByShop.length === 0) && (
              <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                No salary cost data recorded for current week.
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Labour Hours by Shop (Scheduled vs Actual) */}
        <div className="card">
          <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px 0', color: '#1e293b' }}>
            Labour Hours: Scheduled vs Actual
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {charts.labourHoursByShop?.map(s => (
              <div key={s.shopId} style={{ fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600 }}>{s.shopName}</span>
                  <span style={{ color: '#64748b' }}>
                    Actual: <strong style={{ color: '#059669' }}>{s.actualHours}h</strong> / Sched: {s.scheduledHours}h
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '4px', height: '10px' }}>
                  <div style={{ background: '#cbd5e1', borderRadius: '4px', width: `${Math.min(100, (s.scheduledHours / 100) * 100)}%` }} title="Scheduled" />
                  <div style={{ background: '#10b981', borderRadius: '4px', width: `${Math.min(100, (s.actualHours / 100) * 100)}%` }} title="Actual" />
                </div>
              </div>
            ))}
            {(!charts.labourHoursByShop || charts.labourHoursByShop.length === 0) && (
              <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                No labour hours recorded for current week.
              </div>
            )}
          </div>
        </div>

        {/* Chart 3: Shift Attendance Distribution */}
        <div className="card">
          <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px 0', color: '#1e293b' }}>
            Attendance Status Distribution
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#059669' }}>{charts.attendanceDistribution?.present || attendanceStats.present || 0}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#065f46' }}>PRESENT</div>
            </div>
            <div style={{ background: '#fffbeb', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#d97706' }}>{charts.attendanceDistribution?.late || attendanceStats.late || 0}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>LATE (&gt;15m)</div>
            </div>
            <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#2563eb' }}>{charts.attendanceDistribution?.half || attendanceStats.half || 0}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e40af' }}>HALF DAY</div>
            </div>
            <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#dc2626' }}>{charts.attendanceDistribution?.absent || attendanceStats.absent || 0}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#991b1b' }}>ABSENT</div>
            </div>
          </div>
        </div>

        {/* Chart 4: Monthly Salary Trend (Last 6 Months) */}
        <div className="card">
          <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px 0', color: '#1e293b' }}>
            Monthly Payroll Trend (Last 6 Months)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {charts.monthlySalaryTrend?.map((m, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ width: '80px', fontWeight: 600 }}>{m.month}</span>
                <div style={{ flex: 1, margin: '0 12px', display: 'flex', gap: '4px', height: '10px' }}>
                  <div style={{ background: '#2563eb', height: '100%', borderRadius: '4px', width: `${Math.min(100, (m.finalizedSalary / 5000) * 100)}%` }} title={`Finalized: £${m.finalizedSalary}`} />
                  <div style={{ background: '#10b981', height: '100%', borderRadius: '4px', width: `${Math.min(100, (m.totalPaid / 5000) * 100)}%` }} title={`Paid: £${m.totalPaid}`} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, width: '130px', textAlign: 'right' }}>
                  £{m.finalizedSalary.toFixed(2)} (Paid: £{m.totalPaid.toFixed(2)})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Shop Labour & Cost Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Labour & Cost by Shop Location</h2>
          <Link to="/reports" className="btn btn-outline btn-sm">
            Detailed Labour Report <ArrowUpRight size={14} />
          </Link>
        </div>

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Shop Location</th>
                <th>Today's Staff</th>
                <th>Today's Labour Hours</th>
                <th>Today's Wage Cost</th>
                <th>This Week's Final Salary</th>
              </tr>
            </thead>
            <tbody>
              {shopBreakdown.map(s => (
                <tr key={s.shopId}>
                  <td style={{ fontWeight: 600 }}>{s.shopName}</td>
                  <td>{s.todayWorkers} staff</td>
                  <td>{s.todayHours} hrs</td>
                  <td>£{s.todayCost.toFixed(2)}</td>
                  <td style={{ fontWeight: 600, color: '#2563eb' }}>£{s.weekSalaryCost.toFixed(2)}</td>
                </tr>
              ))}
              {shopBreakdown.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    No shop data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
