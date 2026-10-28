import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import {
  Users, Store, Clock, AlertCircle, Banknote, Award, ArrowUpRight,
  TrendingUp, BarChart2, CheckCircle2, ShieldAlert, Database, FileText, Download, X, Calendar
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { downloadReportFile } from '../utils/downloadReportFile';
import ComplianceExpiryBanner from '../components/ComplianceExpiryBanner';
import { useLayout } from '../context/LayoutContext';

// Module-level cache — survives React navigation (component unmount/remount)
// Caches per selected week
const _cache = new Map();
const _inFlight = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // Re-fetch in background after 5 minutes

function loadDashboardData(weekLabel = '') {
  const cacheKey = weekLabel || 'default';
  const cached = _cache.get(cacheKey);
  if (cached && cached.data && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached);
  }

  if (_inFlight.has(cacheKey)) {
    return _inFlight.get(cacheKey);
  }

  const params = weekLabel ? { weekLabel } : {};
  const promise = Promise.all([
    axios.get(`${API_BASE_URL}/dashboard/admin`, { params }),
    axios.get(`${API_BASE_URL}/reports/summary`, { params })
  ]).then(([dashRes, sumRes]) => {
    if (!dashRes.data.success || !sumRes.data.success) {
      throw new Error('Dashboard API returned an unsuccessful response.');
    }

    const result = {
      data: dashRes.data.data,
      summaryData: sumRes.data,
      fetchedAt: Date.now()
    };

    const actualWeek = result.summaryData?.currentWeek || result.data?.weekLabel;
    _cache.set(cacheKey, result);
    if (actualWeek) {
      _cache.set(actualWeek, result);
    }
    if (!weekLabel && actualWeek) {
      _cache.set('default', result);
    }
    _inFlight.delete(cacheKey);
    return result;
  }).catch(err => {
    _inFlight.delete(cacheKey);
    throw err;
  });

  _inFlight.set(cacheKey, promise);
  return promise;
}

const getInitialDashboardCache = () => {
  if (_cache.has('default')) return _cache.get('default');
  for (const item of _cache.values()) {
    if (item?.data) return item;
  }
  return null;
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { hideNavbar, toggleNavbar, hideSidebar, toggleSidebar } = useLayout();
  const initialCache = getInitialDashboardCache();
  const [data, setData]                         = useState(() => initialCache?.data || null);
  const [summaryData, setSummaryData]           = useState(() => initialCache?.summaryData || null);
  const [availableWeeks, setAvailableWeeks]     = useState(() => initialCache?.summaryData?.availableWeeks || initialCache?.data?.availableWeeks || []);
  const [selectedWeek, setSelectedWeek]         = useState(() => initialCache?.data?.weekLabel || initialCache?.summaryData?.currentWeek || '');
  const [loading, setLoading]                   = useState(() => !initialCache);
  const [isFetchingWeek, setIsFetchingWeek]     = useState(false);
  const [error, setError]                       = useState('');
  const [showBackupModal, setShowBackupModal]   = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState('');
  const isMounted = useRef(true);

  const handleDownloadBackup = async (format = 'zip', month = 'last', scope = 'month') => {
    const key = `${format}_${month}_${scope}`;
    setDownloadingBackup(key);
    try {
      const now = new Date();
      let filenameLabel = 'Last_Month';
      if (scope === 'all') {
        filenameLabel = 'Full';
      } else if (month !== 'last') {
        filenameLabel = `${now.toLocaleString('en-US', { month: 'short' })}_${now.getFullYear()}`;
      }
      const ext = format === 'zip' ? 'zip' : format === 'excel' ? 'xlsx' : 'pdf';
      const filename = `Pixx_System_Database_Backup_${filenameLabel}.${ext}`;
      await downloadReportFile(`/reports/system-backup/${format}`, {
        month,
        year: now.getFullYear(),
        scope
      }, filename);
    } catch (err) {
      alert(err.message || 'Failed to download database backup.');
    } finally {
      setDownloadingBackup('');
    }
  };

  useEffect(() => {
    isMounted.current = true;
    fetchDashboard(selectedWeek);
    return () => { isMounted.current = false; };
  }, [selectedWeek]);

  const fetchDashboard = async (weekToFetch) => {
    if (!data) setLoading(true);
    else setIsFetchingWeek(true);
    setError('');
    try {
      const result = await loadDashboardData(weekToFetch);
      if (!isMounted.current) return;
      setData(result.data);
      setSummaryData(result.summaryData);

      const weeks = result.summaryData?.availableWeeks || result.data?.availableWeeks || [];
      if (weeks.length > 0) {
        setAvailableWeeks(weeks);
      }
      if (!weekToFetch) {
        const defaultWeek = result.summaryData?.currentWeek || result.data?.weekLabel || weeks[0];
        if (defaultWeek && defaultWeek !== selectedWeek) {
          setSelectedWeek(defaultWeek);
        }
      }
    } catch (err) {
      if (!isMounted.current) return;
      console.error('Failed to load dashboard:', err);
      if (!data) {
        setError('Unable to load executive dashboard data. Please check connection and try again.');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsFetchingWeek(false);
      }
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
  const maxWeeklyHours = Math.max(
    1,
    ...(charts.labourHoursByShop || []).flatMap(shop => [shop.scheduledHours || 0, shop.actualHours || 0])
  );
  const maxMonthlySalary = Math.max(
    1,
    ...(charts.monthlySalaryTrend || []).map(month => month.finalizedSalary || 0),
    ...(charts.monthlySalaryTrend || []).map(month => month.totalPaid || 0)
  );

  return (
    <div className={`page-container ${hideSidebar ? 'no-scroll-dashboard' : ''}`}>
      {/* Title & Quick Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hideSidebar ? '12px' : '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: hideSidebar ? '20px' : '24px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Executive Dashboard
            </h1>
            {isFetchingWeek && (
              <span style={{ fontSize: '11px', background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '12px', fontWeight: 600 }}>
                Updating...
              </span>
            )}
          </div>
          <p style={{ color: '#64748b', fontSize: '12px', margin: '2px 0 0 0' }}>
            PixxTechnologies UK Rota, Attendance & Labour Economics
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* View Toggles: Navbar & Sidebar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#ffffff',
            padding: '3px 6px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <button
              type="button"
              onClick={toggleNavbar}
              style={{
                background: hideNavbar ? '#eff6ff' : '#f8fafc',
                color: hideNavbar ? '#2563eb' : '#334155',
                border: `1px solid ${hideNavbar ? '#3b82f6' : '#cbd5e1'}`,
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease'
              }}
              title={hideNavbar ? 'Show top navbar' : 'Hide top navbar for more screen space'}
            >
              {hideNavbar ? '🔽 Show Navbar' : '🔼 Hide Navbar'}
            </button>

            <button
              type="button"
              onClick={toggleSidebar}
              style={{
                background: hideSidebar ? '#eff6ff' : '#f8fafc',
                color: hideSidebar ? '#2563eb' : '#334155',
                border: `1px solid ${hideSidebar ? '#3b82f6' : '#cbd5e1'}`,
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease'
              }}
              title={hideSidebar ? 'Show sidebar menu' : 'Hide sidebar for wide no-scroll view'}
            >
              {hideSidebar ? '▶ Show Sidebar' : '◀ Hide Sidebar (No-Scroll View)'}
            </button>
          </div>

          {/* Week Selector Dropdown */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#ffffff',
            padding: '6px 12px',
            borderRadius: '8px',
            border: '2px solid #2563eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <Calendar size={18} color="#2563eb" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: '#2563eb', letterSpacing: '0.5px', lineHeight: 1 }}>
                Select Rota Week
              </span>
              <select
                value={selectedWeek || summaryData?.currentWeek || weekLabel || ''}
                onChange={(e) => setSelectedWeek(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#0f172a',
                  cursor: 'pointer',
                  outline: 'none',
                  padding: '2px 0 0 0'
                }}
              >
                {availableWeeks.map((w, idx) => (
                  <option key={w} value={w}>
                    {w} {idx === 0 ? ' (Latest)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => setShowBackupModal(true)}
            className="btn btn-sm"
            style={{
              background: '#0f172a',
              color: '#ffffff',
              border: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600
            }}
          >
            <Database size={14} color="#38bdf8" /> Database Backup (ZIP)
          </button>
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

      {/* Compliance Expiry Banner (1 Month and 1 Week Alerts for Visas/Passports/Documents) */}
      <ComplianceExpiryBanner onEditEmployee={(empId, tab) => navigate('/employees')} />

      {/* Section 19: Comprehensive Management Summary Cards */}
      <div className={`stat-grid ${hideSidebar ? 'no-scroll-stat-grid' : ''}`} style={{ marginBottom: hideSidebar ? '12px' : '24px' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
          <div className="stat-lbl">Finalized Salary</div>
          <div className="stat-val" style={{ color: '#2563eb' }}>
            £{(cards.finalizedSalary ?? thisWeekSalaryTotal ?? 0).toFixed(2)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Week: {selectedWeek || summaryData?.currentWeek || weekLabel}
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="stat-lbl">Salary Paid</div>
          <div className="stat-val" style={{ color: '#059669' }}>
            £{(cards.totalPaid ?? thisWeekPaidTotal ?? 0).toFixed(2)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Disbursed wages
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="stat-lbl">Outstanding Balance</div>
          <div className="stat-val" style={{ color: '#dc2626' }}>
            £{(cards.outstanding ?? thisWeekOutstanding ?? 0).toFixed(2)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Remaining salary liability
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-lbl">Active Workforce</div>
          <div className="stat-val">{cards.activeEmployees ?? activeEmployees}</div>
          <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
            {totalEmployees} Total Registered
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-lbl">Labour Hours</div>
          <div className="stat-val">{Number(cards.labourHours ?? attendanceStats.totalHours ?? 0).toFixed(1)}h</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Actual worked hours
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-lbl">Net Attendance Pay</div>
          <div className="stat-val">£{Number(cards.attendancePay ?? attendanceStats.totalWages ?? 0).toFixed(2)}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Direct shift earnings
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-lbl">Monthly Bonuses</div>
          <div className="stat-val">£{Number(cards.bonuses ?? monthlyBonusTotal ?? 0).toFixed(2)}</div>
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
      <div className={`dashboard-charts-grid ${hideSidebar ? 'no-scroll-charts-grid' : ''}`} style={{ marginBottom: hideSidebar ? '12px' : '24px' }}>
        {/* Chart 1: Salary by Shop */}
        <div className="card">
          <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px 0', color: '#1e293b' }}>
            Salary Cost by Shop Location (£)
          </h2>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '-8px 0 16px' }}>
            Finalized payroll for {summaryData?.currentWeek || weekLabel}; multi-shop wages are split by attendance pay.
          </p>
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
                  <div style={{ background: '#f1f5f9', height: '10px', borderRadius: '5px', overflow: 'hidden' }} title="Share of the largest shop's weekly salary cost">
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
          <p style={{ fontSize: '12px', color: '#64748b', margin: '-8px 0 16px' }}>
            Attendance records for {selectedWeek || summaryData?.currentWeek || weekLabel}, grouped by the shop where each shift took place.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {charts.labourHoursByShop?.map(s => (
              <div key={s.shopId} style={{ fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600 }}>{s.shopName}</span>
                  <span style={{ color: '#64748b' }}>
                    Actual: <strong style={{ color: '#059669' }}>{s.actualHours}h</strong> / Sched: {s.scheduledHours}h
                  </span>
                </div>
                <div style={{ display: 'grid', gap: '4px' }} title="Scheduled and actual hours are scaled against the highest shop total">
                  <div style={{ background: '#f1f5f9', height: '5px', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ background: '#cbd5e1', height: '100%', width: `${Math.min(100, (s.scheduledHours / maxWeeklyHours) * 100)}%` }} title={`Scheduled: ${s.scheduledHours} hours`} />
                  </div>
                  <div style={{ background: '#f1f5f9', height: '5px', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ background: '#10b981', height: '100%', width: `${Math.min(100, (s.actualHours / maxWeeklyHours) * 100)}%` }} title={`Actual: ${s.actualHours} hours`} />
                  </div>
                </div>
              </div>
            ))}
            {(!charts.labourHoursByShop || charts.labourHoursByShop.length === 0) && (
              <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                No labour hours recorded for selected week.
              </div>
            )}
          </div>
        </div>

        {/* Chart 3: Shift Attendance Distribution */}
        <div className="card">
          <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px 0', color: '#1e293b' }}>
            Attendance Status Distribution
          </h2>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '-8px 0 16px' }}>
            Attendance records for {selectedWeek || summaryData?.currentWeek || weekLabel}; counts are shift records.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#059669' }}>{charts.attendanceDistribution?.present ?? attendanceStats.present ?? 0}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#065f46' }}>PRESENT</div>
            </div>
            <div style={{ background: '#fffbeb', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#d97706' }}>{charts.attendanceDistribution?.late ?? attendanceStats.late ?? 0}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>LATE (&gt;15m)</div>
            </div>
            <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#2563eb' }}>{charts.attendanceDistribution?.half ?? attendanceStats.half ?? 0}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e40af' }}>HALF DAY</div>
            </div>
            <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#dc2626' }}>{charts.attendanceDistribution?.absent ?? attendanceStats.absent ?? 0}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#991b1b' }}>ABSENT</div>
            </div>
          </div>
        </div>

        {/* Chart 4: Monthly Salary Trend (Last 6 Months) */}
        <div className="card">
          <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px 0', color: '#1e293b' }}>
            Monthly Payroll Trend (Last 6 Months)
          </h2>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '-8px 0 16px' }}>
            Weekly payroll is grouped into the month containing the rota week's end date.
          </p>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '11px', color: '#64748b', margin: '-8px 0 14px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#2563eb' }}></span> Finalized
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981' }}></span> Total Paid
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {charts.monthlySalaryTrend?.map((m, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', gap: '8px' }}>
                <span style={{ width: '65px', fontWeight: 600, flexShrink: 0 }}>{m.month}</span>
                <div style={{ flex: 1, margin: '0 8px', display: 'grid', gap: '3px', minWidth: '60px' }} title="Weekly payroll grouped by the month in which each rota week ends">
                  <div style={{ background: '#f1f5f9', height: '5px', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ background: '#2563eb', height: '100%', width: `${Math.min(100, (m.finalizedSalary / maxMonthlySalary) * 100)}%` }} title={`Finalized: £${m.finalizedSalary}`} />
                  </div>
                  <div style={{ background: '#f1f5f9', height: '5px', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ background: '#10b981', height: '100%', width: `${Math.min(100, (m.totalPaid / maxMonthlySalary) * 100)}%` }} title={`Paid: £${m.totalPaid}`} />
                  </div>
                </div>
                <div style={{ fontSize: '12px', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>
                    £{m.finalizedSalary.toFixed(2)}{' '}
                    <span style={{ color: '#059669', fontWeight: 600 }}>
                      (Paid: £{m.totalPaid.toFixed(2)})
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', marginTop: '2px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span style={{ color: '#b45309', fontWeight: 600, background: '#fef3c7', padding: '1px 5px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                      C2: £{(m.cashPaid || 0).toFixed(2)}
                    </span>
                    <span style={{ color: '#4338ca', fontWeight: 600, background: '#e0e7ff', padding: '1px 5px', borderRadius: '4px', border: '1px solid #c7d2fe' }}>
                      Bank: £{(m.bankPaid || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Shop Labour & Cost Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Labour & Cost by Shop Location</h2>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
              Full week performance breakdown for {selectedWeek || summaryData?.currentWeek || weekLabel}
            </p>
          </div>
          <Link to="/reports" className="btn btn-outline btn-sm">
            Detailed Labour Report <ArrowUpRight size={14} />
          </Link>
        </div>

        <div className={`table-responsive ${hideSidebar ? 'no-scroll-table-container' : ''}`}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Shop Location</th>
                <th>Week Staff</th>
                <th>Week Labour Hours</th>
                <th>Shift Wage Cost</th>
                <th>Allocated Final Salary</th>
              </tr>
            </thead>
            <tbody>
              {shopBreakdown.map(s => (
                <tr key={s.shopId}>
                  <td style={{ fontWeight: 600 }}>{s.shopName}</td>
                  <td>{s.weekWorkers ?? s.todayWorkers} staff</td>
                  <td>{s.weekHours ?? s.todayHours} hrs</td>
                  <td>£{Number((s.weekCost ?? s.todayCost) || 0).toFixed(2)}</td>
                  <td style={{ fontWeight: 600, color: '#2563eb' }}>£{Number(s.weekSalaryCost || 0).toFixed(2)}</td>
                </tr>
              ))}
              {shopBreakdown.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    No shop data available for this week.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Database Backup Modal */}
      {showBackupModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '540px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              padding: '20px 24px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '10px',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Database size={20} color="#38bdf8" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#ffffff' }}>
                    System Database Backup (.zip)
                  </h3>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    JSON Collections & Manifest Archive (backup.zip)
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowBackupModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                Download a complete database backup archive (<strong>.zip</strong>) containing all MongoDB collections formatted as JSON, with <code>manifest.json</code> and checksum ready for backup storage or database restoration:
              </p>

              {/* Option 1: Last Month Backup */}
              <div style={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc'
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
                    📦 Last Month Database Backup (.zip)
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Full JSON collection files + manifest for previous month
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => handleDownloadBackup('zip', 'last')}
                  disabled={Boolean(downloadingBackup)}
                  style={{
                    background: '#2563eb',
                    color: '#ffffff',
                    fontWeight: 600,
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={14} />
                  {downloadingBackup === 'zip_last_month' ? 'Creating ZIP...' : 'Download ZIP'}
                </button>
              </div>

              {/* Option 2: Current Month Backup */}
              <div style={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc'
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
                    📅 Current Month Database Backup (.zip)
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    All collections, attendance & salaries up to today in JSON archive
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => handleDownloadBackup('zip', new Date().getMonth() + 1)}
                  disabled={Boolean(downloadingBackup)}
                  style={{
                    background: '#059669',
                    color: '#ffffff',
                    fontWeight: 600,
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={14} />
                  {downloadingBackup.startsWith('zip_') && !downloadingBackup.includes('last') && !downloadingBackup.includes('all') ? 'Creating ZIP...' : 'Download ZIP'}
                </button>
              </div>

              {/* Option 3: Full Lifetime Backup */}
              <div style={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc'
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
                    🌐 Lifetime System Database Backup (.zip)
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Complete database dump of all collections since inception
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => handleDownloadBackup('zip', null, 'all')}
                  disabled={Boolean(downloadingBackup)}
                  style={{
                    background: '#7c3aed',
                    color: '#ffffff',
                    fontWeight: 600,
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={14} />
                  {downloadingBackup === 'zip_null_all' ? 'Creating ZIP...' : 'Download ZIP'}
                </button>
              </div>

              {/* Footer links */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '14px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleDownloadBackup('pdf', 'last')}
                    disabled={Boolean(downloadingBackup)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                  >
                    <FileText size={13} /> PDF Report
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleDownloadBackup('excel', 'last')}
                    disabled={Boolean(downloadingBackup)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                  >
                    <Download size={13} /> Excel (.xlsx)
                  </button>
                </div>
                <Link
                  to="/reports"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowBackupModal(false)}
                  style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb', borderColor: '#bfdbfe' }}
                >
                  Advanced Reports →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
