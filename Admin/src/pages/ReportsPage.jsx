import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL, useAuth } from '../context/AuthContext';
import { downloadReportFile } from '../utils/downloadReportFile';
import { formatTime12Hour } from '../utils/formatTime';
import {
  FileText, Download, MessageSquare, Clock, Users, Award,
  RefreshCw, Calendar, Banknote, CreditCard, Building, CheckCircle,
  AlertCircle, ChevronRight, TrendingUp, Layers
} from 'lucide-react';

const SHOP_COLORS = {
  Camden: { bg: '#f0fdfa', color: '#0f766e', border: '#5eead4' },
  Chelsea: { bg: '#eef2ff', color: '#3730a3', border: '#a5b4fc' },
  Edgware: { bg: '#faf5ff', color: '#6b21a8', border: '#d8b4fe' },
  Southwark: { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
  Station: { bg: '#f0f9ff', color: '#0369a1', border: '#7dd3fc' },
  Leebridge: { bg: '#fff1f2', color: '#9f1239', border: '#fda4af' },
};

function getShopBadgeStyle(shopName) {
  if (!shopName) return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
  const match = Object.keys(SHOP_COLORS).find(k => k.toLowerCase() === String(shopName).trim().toLowerCase());
  return match ? SHOP_COLORS[match] : { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
}

export default function ReportsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState('daily_attendance');

  // Shared Filter States
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString('en-US', { month: 'short' }));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedShop, setSelectedShop] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Dropdown options
  const [shops, setShops] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadingMonthlyReport, setDownloadingMonthlyReport] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Report Specific Data States
  const [dailyData, setDailyData] = useState(null);
  const [weeklyAttendanceData, setWeeklyAttendanceData] = useState(null);
  const [weeklySalaryData, setWeeklySalaryData] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [yearlyData, setYearlyData] = useState(null);
  const [bonusData, setBonusData] = useState(null);
  const [labourData, setLabourData] = useState(null);
  const [paymentsData, setPaymentsData] = useState(null);
  const [ledgerData, setLedgerData] = useState(null);
  const [cashBankSummary, setCashBankSummary] = useState(null);

  useEffect(() => {
    fetchShopsAndEmployees();
  }, []);

  useEffect(() => {
    fetchActiveReport();
  }, [
    activeTab, selectedDate, selectedWeek, selectedMonth, selectedYear,
    selectedShop, selectedEmployee, selectedStatus, paymentMethod, startDate, endDate
  ]);

  const fetchShopsAndEmployees = async () => {
    try {
      const [shopsRes, empRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/shops`),
        axios.get(`${API_BASE_URL}/employees`)
      ]);
      if (shopsRes.data.success) setShops(shopsRes.data.shops || []);
      if (empRes.data.success) setEmployees(empRes.data.employees || []);
    } catch (err) {
      console.error('Error fetching metadata:', err);
      setErrorMsg(!err.response
        ? `Cannot reach the API at ${API_BASE_URL}. Make sure the backend is running.`
        : err.response.data?.message || 'Unable to load report filters.');
    }
  };

  const fetchActiveReport = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (activeTab === 'daily_attendance') {
        const res = await axios.get(`${API_BASE_URL}/reports/daily-attendance`, {
          params: { date: selectedDate, shopId: selectedShop, employeeId: selectedEmployee || undefined, status: selectedStatus || undefined }
        });
        if (res.data.success) setDailyData(res.data);
      } else if (activeTab === 'weekly_attendance') {
        const res = await axios.get(`${API_BASE_URL}/reports/weekly-attendance`, {
          params: { weekLabel: selectedWeek || undefined, date: selectedDate || undefined, shopId: selectedShop || undefined, employeeId: selectedEmployee || undefined }
        });
        if (res.data.success) setWeeklyAttendanceData(res.data);
      } else if (activeTab === 'weekly_salary' && isAdmin) {
        const res = await axios.get(`${API_BASE_URL}/reports/weekly-salary`, {
          params: { weekLabel: selectedWeek || undefined, date: selectedDate || undefined, shopId: selectedShop || undefined, employeeId: selectedEmployee || undefined, status: selectedStatus || undefined }
        });
        if (res.data.success) setWeeklySalaryData(res.data);
      } else if (activeTab === 'employee_monthly' && isAdmin) {
        const empId = selectedEmployee || (employees.length > 0 ? employees[0]._id : null);
        if (!empId) return;
        if (!selectedEmployee) setSelectedEmployee(empId);
        const monthNum = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(selectedMonth) + 1;
        const res = await axios.get(`${API_BASE_URL}/reports/employee-monthly`, {
          params: { employeeId: empId, month: monthNum, year: selectedYear }
        });
        if (res.data.success) setMonthlyData(res.data);
      } else if (activeTab === 'employee_yearly' && isAdmin) {
        const empId = selectedEmployee || (employees.length > 0 ? employees[0]._id : null);
        if (!empId) return;
        if (!selectedEmployee) setSelectedEmployee(empId);
        const res = await axios.get(`${API_BASE_URL}/reports/employee-yearly`, {
          params: { employeeId: empId, year: selectedYear }
        });
        if (res.data.success) setYearlyData(res.data);
      } else if (activeTab === 'bonus' && isAdmin) {
        const res = await axios.get(`${API_BASE_URL}/reports/bonus`, {
          params: { month: selectedMonth || undefined, year: selectedYear || undefined, employeeId: selectedEmployee || undefined, shopId: selectedShop || undefined }
        });
        if (res.data.success) setBonusData(res.data);
      } else if (activeTab === 'shop_labour') {
        const res = await axios.get(`${API_BASE_URL}/reports/shop-labour`, {
          params: { startDate: startDate || undefined, endDate: endDate || undefined, shopId: selectedShop || undefined, employeeId: selectedEmployee || undefined }
        });
        if (res.data.success) setLabourData(res.data);
      } else if (activeTab === 'payments' && isAdmin) {
        const [payRes, sumRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/reports/payments`, {
            params: { startDate: startDate || undefined, endDate: endDate || undefined, shopId: selectedShop || undefined, employeeId: selectedEmployee || undefined, paymentMethod: paymentMethod || undefined }
          }),
          axios.get(`${API_BASE_URL}/reports/payments/summary`, {
            params: { startDate: startDate || undefined, endDate: endDate || undefined }
          })
        ]);
        if (payRes.data.success) setPaymentsData(payRes.data);
        if (sumRes.data.success) setCashBankSummary(sumRes.data.summary);
      } else if (activeTab === 'ledger' && isAdmin) {
        const empId = selectedEmployee || (employees.length > 0 ? employees[0]._id : null);
        if (!empId) return;
        if (!selectedEmployee) setSelectedEmployee(empId);
        const res = await axios.get(`${API_BASE_URL}/reports/ledger/${empId}`, {
          params: { startDate: startDate || undefined, endDate: endDate || undefined }
        });
        if (res.data.success) setLedgerData(res.data);
      }
    } catch (err) {
      console.error('Failed to load report:', err);
      setErrorMsg(!err.response
        ? `Cannot reach the API at ${API_BASE_URL}. Make sure the backend is running.`
        : err.response.data?.message || 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

  const copyWhatsApp = () => {
    if (dailyData?.whatsAppText) {
      navigator.clipboard.writeText(dailyData.whatsAppText);
      alert('WhatsApp daily attendance summary copied to clipboard!');
    }
  };

  const [downloading, setDownloading] = useState('');

  const handleDownload = async (path, params, filename) => {
    const key = path + filename;
    setDownloading(key);
    setErrorMsg('');
    try {
      await downloadReportFile(path, params, filename);
    } catch (error) {
      setErrorMsg(error.message || 'Unable to download the report.');
    } finally {
      setDownloading('');
    }
  };

  const downloadMonthlyReport = async (format) => {
    if (!selectedEmployee) {
      setErrorMsg('Select an employee before downloading a monthly report.');
      return;
    }
    const month = monthOptions.indexOf(selectedMonth) + 1;
    setDownloadingMonthlyReport(format);
    setErrorMsg('');
    try {
      await downloadReportFile(
        `/reports/employee-monthly/${format}`,
        { employeeId: selectedEmployee, month, year: selectedYear },
        `Employee_Monthly_${selectedYear}-${String(month).padStart(2, '0')}.${format === 'excel' ? 'xlsx' : 'pdf'}`
      );
    } catch (error) {
      setErrorMsg(error.message || `Unable to download the monthly ${format.toUpperCase()} report.`);
    } finally {
      setDownloadingMonthlyReport('');
    }
  };

  const monthOptions = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yearOptions = [2025, 2026, 2027];

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    if (!['employee_monthly', 'employee_yearly', 'ledger'].includes(newTab)) {
      setSelectedEmployee('');
    } else if (!selectedEmployee && employees.length > 0) {
      setSelectedEmployee(employees[0]._id);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
            Reporting & Analytics Centre
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0 0' }}>
            Comprehensive Payroll, Attendance, Labour Hours, Commission & Ledger Reports
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchActiveReport} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Data
        </button>
      </div>

      {/* Main Category Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px', overflowX: 'auto', paddingBottom: '6px' }}>
        <button
          className={`btn ${activeTab === 'daily_attendance' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => handleTabChange('daily_attendance')}
        >
          <Clock size={14} /> Daily Attendance
        </button>
        <button
          className={`btn ${activeTab === 'weekly_attendance' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => handleTabChange('weekly_attendance')}
        >
          <Calendar size={14} /> Weekly Attendance
        </button>
        {isAdmin && (
          <button
            className={`btn ${activeTab === 'weekly_salary' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => handleTabChange('weekly_salary')}
          >
            <Banknote size={14} /> Weekly Salary
          </button>
        )}
        {isAdmin && (
          <button
            className={`btn ${activeTab === 'employee_monthly' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => handleTabChange('employee_monthly')}
          >
            <Users size={14} /> Employee Monthly
          </button>
        )}
        {isAdmin && (
          <button
            className={`btn ${activeTab === 'employee_yearly' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => handleTabChange('employee_yearly')}
          >
            <Layers size={14} /> Employee Yearly
          </button>
        )}
        {isAdmin && (
          <button
            className={`btn ${activeTab === 'bonus' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => handleTabChange('bonus')}
          >
            <Award size={14} /> Monthly Bonus
          </button>
        )}
        <button
          className={`btn ${activeTab === 'shop_labour' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => handleTabChange('shop_labour')}
        >
          <Building size={14} /> Shop Labour Hours
        </button>
        {isAdmin && (
          <button
            className={`btn ${activeTab === 'payments' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => handleTabChange('payments')}
          >
            <CreditCard size={14} /> Salary Payments
          </button>
        )}
        {isAdmin && (
          <button
            className={`btn ${activeTab === 'ledger' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => handleTabChange('ledger')}
          >
            <FileText size={14} /> Salary Ledger
          </button>
        )}
      </div>

      {/* Common Filter Controls Bar */}
      <div className="card" style={{ marginBottom: '24px', padding: '14px 18px', background: '#f8fafc' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Date Picker (for Daily / Weekly) */}
          {(activeTab === 'daily_attendance' || activeTab === 'weekly_attendance' || activeTab === 'weekly_salary') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Date:</label>
              <input
                type="date"
                className="form-input"
                style={{ width: '145px', padding: '6px 8px' }}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          )}

          {/* Date Range Picker (for Labour, Payments, Ledger) */}
          {(activeTab === 'shop_labour' || activeTab === 'payments' || activeTab === 'ledger') && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>From:</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: '145px', padding: '6px 8px' }}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>To:</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: '145px', padding: '6px 8px' }}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Month / Year Pickers (Monthly, Yearly, Bonus) */}
          {(activeTab === 'employee_monthly' || activeTab === 'bonus') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Month:</label>
              <select
                className="form-select"
                style={{ width: '90px', padding: '6px 8px' }}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {(activeTab === 'employee_monthly' || activeTab === 'employee_yearly' || activeTab === 'bonus') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Year:</label>
              <select
                className="form-select"
                style={{ width: '95px', padding: '6px 8px' }}
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {/* Shop Selector */}
          {activeTab !== 'ledger' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Shop:</label>
              <select
                className="form-select"
                style={{ width: '150px', padding: '6px 8px' }}
                value={selectedShop}
                onChange={(e) => setSelectedShop(e.target.value)}
              >
                <option value="">All Shops</option>
                {shops.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Employee Selector (Mandatory for Monthly, Yearly, Ledger; optional for others) */}
          {(activeTab === 'employee_monthly' || activeTab === 'employee_yearly' || activeTab === 'ledger' || activeTab === 'daily_attendance' || activeTab === 'weekly_attendance' || activeTab === 'weekly_salary' || activeTab === 'payments') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                Employee:
              </label>
              <select
                className="form-select"
                style={{ width: '180px', padding: '6px 8px' }}
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
              >
                {['employee_monthly', 'employee_yearly', 'ledger'].includes(activeTab) ? null : <option value="">All Employees</option>}
                {employees.map(e => <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>)}
              </select>
            </div>
          )}

          {/* Payment Method Selector */}
          {activeTab === 'payments' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Method:</label>
              <select
                className="form-select"
                style={{ width: '110px', padding: '6px 8px' }}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="">All Methods</option>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', marginBottom: '20px', fontSize: '13px' }}>
          {errorMsg}
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. TAB: DAILY ATTENDANCE                                 */}
      {/* ======================================================== */}
      {activeTab === 'daily_attendance' && dailyData && (
        <div>
          {/* Summary KPIs */}
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card">
              <div className="stat-lbl">Staff Recorded</div>
              <div className="stat-val">{dailyData.summary?.totalEmployees || 0}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Scheduled: {dailyData.summary?.totalScheduledHours || 0}h</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="stat-lbl">Present / On Time</div>
              <div className="stat-val" style={{ color: '#059669' }}>{dailyData.summary?.present || 0}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Late: {dailyData.summary?.late || 0}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="stat-lbl">Half / Absent</div>
              <div className="stat-val" style={{ color: '#dc2626' }}>{(dailyData.summary?.half || 0) + (dailyData.summary?.absent || 0)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Absent: {dailyData.summary?.absent || 0}</div>
            </div>
            {isAdmin && <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
              <div className="stat-lbl">Net Attendance Pay</div>
              <div className="stat-val" style={{ color: '#2563eb' }}>£{(dailyData.summary?.totalAttendancePay || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Late Ded: £{(dailyData.summary?.totalLateDeductions || 0).toFixed(2)}</div>
            </div>}
          </div>

          {/* Export Actions Bar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '16px' }}>
            <button className="btn btn-outline btn-sm" onClick={copyWhatsApp}>
              <MessageSquare size={14} color="#16a34a" /> Copy WhatsApp Summary
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => handleDownload('/reports/daily-attendance/excel', { date: selectedDate, shopId: selectedShop || undefined, employeeId: selectedEmployee || undefined }, `Daily_Attendance_${selectedDate}.xlsx`)}
            >
              <Download size={14} /> Export Excel
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => handleDownload('/reports/daily-attendance/pdf', { date: selectedDate, shopId: selectedShop || undefined, employeeId: selectedEmployee || undefined }, `Daily_Attendance_${selectedDate}.pdf`)}
            >
              <Download size={14} /> Export PDF
            </button>
          </div>

          {/* Records Table */}
          <div className="card">
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Shop</th>
                    <th>ID</th>
                    <th>Employee Name</th>
                    <th>Shift</th>
                    <th>Actual Shift</th>
                    <th>Worked (h)</th>
                    <th>Late (m)</th>
                    {isAdmin && <th>Wage (£)</th>}
                    {isAdmin && <th>Late Ded (£)</th>}
                    {isAdmin && <th>Net Pay (£)</th>}
                    <th>Status</th>
                    <th>Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyData.records?.slice().sort((a, b) => {
                    const aAbsent = a.status === 'Absent';
                    const bAbsent = b.status === 'Absent';
                    if (aAbsent && !bAbsent) return 1;
                    if (!aAbsent && bAbsent) return -1;
                    if (!aAbsent && !bAbsent) {
                      const sDiff = (a.shopName || '').localeCompare(b.shopName || '');
                      if (sDiff !== 0) return sDiff;
                    }
                    return (a.employeeName || '').localeCompare(b.employeeName || '');
                  }).map(r => {
                    const isAbsent = r.status === 'Absent';
                    const shopStyle = getShopBadgeStyle(r.shopName);
                    return (
                    <tr key={r._id} style={{ backgroundColor: isAbsent ? '#fffafb' : undefined }}>
                      <td>
                        {isAbsent ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            backgroundColor: '#fef2f2',
                            color: '#b91c1c',
                            border: '1px solid #fecaca'
                          }}>
                            Absent / Off
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            backgroundColor: shopStyle.bg,
                            color: shopStyle.color,
                            border: `1px solid ${shopStyle.border}`
                          }}>
                            {r.shopName || '—'}
                          </span>
                        )}
                      </td>
                      <td>{r.employeeId}</td>
                      <td style={{ fontWeight: 500 }}>{r.employeeName}</td>
                      <td>{r.status === 'Absent' ? '—' : `${formatTime12Hour(r.shiftStart)} - ${formatTime12Hour(r.shiftEnd)}`}</td>
                      <td>{r.status === 'Absent' ? 'Absent / Off' : `${formatTime12Hour(r.timeReached)} - ${formatTime12Hour(r.workerEndTime)}`}</td>
                      <td>{r.status === 'Absent' ? '—' : `${r.actualHours}h`}</td>
                      <td>{r.status === 'Absent' ? '—' : r.lateMinutes > 0 ? `${r.lateMinutes}m` : '-'}</td>
                      {isAdmin && <td>£{(r.dailyWage || 0).toFixed(2)}</td>}
                      {isAdmin && <td style={{ color: r.lateDeduction > 0 ? '#dc2626' : 'inherit' }}>
                        {r.lateDeduction > 0 ? `£${r.lateDeduction.toFixed(2)}` : '£0.00'}
                      </td>}
                      {isAdmin && <td style={{ fontWeight: 700, color: '#2563eb' }}>£{(r.attendancePay || 0).toFixed(2)}</td>}
                      <td>
                        <span className={`badge ${r.status === 'Present' ? 'badge-success' : r.status === 'Late' ? 'badge-warning' : 'badge-danger'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-info">{r.approvalStatus}</span>
                      </td>
                    </tr>
                    );
                  })}
                  {(!dailyData.records || dailyData.records.length === 0) && (
                    <tr>
                      <td colSpan={isAdmin ? 12 : 9} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No attendance records found for the selected date and filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. TAB: WEEKLY ATTENDANCE                                */}
      {/* ======================================================== */}
      {activeTab === 'weekly_attendance' && weeklyAttendanceData && (
        <div>
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card">
              <div className="stat-lbl">Staff Recorded</div>
              <div className="stat-val">{weeklyAttendanceData.summary?.totalEmployees || 0}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Week: {weeklyAttendanceData.weekLabel}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="stat-lbl">Total Working Days</div>
              <div className="stat-val" style={{ color: '#059669' }}>{weeklyAttendanceData.summary?.totalWorkingDays || 0}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Present: {weeklyAttendanceData.summary?.totalPresent || 0}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="stat-lbl">Total Hours Worked</div>
              <div className="stat-val" style={{ color: '#d97706' }}>{Number(weeklyAttendanceData.summary?.totalWorkedHours || 0).toFixed(1)}h</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Scheduled: {Number(weeklyAttendanceData.summary?.totalScheduledHours || 0).toFixed(1)}h</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
              <div className="stat-lbl">Total Attendance Pay</div>
              <div className="stat-val" style={{ color: '#2563eb' }}>£{(weeklyAttendanceData.summary?.totalAttendancePay || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Deductions: £{(weeklyAttendanceData.summary?.totalLateDeductions || 0).toFixed(2)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '16px' }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => handleDownload('/reports/weekly-attendance/excel', { date: selectedDate, shopId: selectedShop || undefined, employeeId: selectedEmployee || undefined }, `Weekly_Attendance_${selectedDate}.xlsx`)}
            >
              <Download size={14} /> Export Excel
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => handleDownload('/reports/weekly-attendance/pdf', { date: selectedDate, shopId: selectedShop || undefined, employeeId: selectedEmployee || undefined }, `Weekly_Attendance_${selectedDate}.pdf`)}
            >
              <Download size={14} /> Export PDF
            </button>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Shop</th>
                    <th>ID</th>
                    <th>Employee Name</th>
                    <th>Work Days</th>
                    <th>Present</th>
                    <th>Late</th>
                    <th>Half</th>
                    <th>Absent</th>
                    <th>Hours Worked</th>
                    <th>Late (m)</th>
                    <th>Late Ded (£)</th>
                    <th>Attendance Pay (£)</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyAttendanceData.records?.map(r => (
                    <tr key={r.employeeId}>
                      <td style={{ fontWeight: 600 }}>{r.shopName}</td>
                      <td>{r.employeeId}</td>
                      <td style={{ fontWeight: 500 }}>{r.employeeName}</td>
                      <td style={{ fontWeight: 600 }}>{r.workingDays}</td>
                      <td style={{ color: '#059669' }}>{r.presentDays}</td>
                      <td style={{ color: '#d97706' }}>{r.lateDays}</td>
                      <td style={{ color: '#2563eb' }}>{r.halfDays}</td>
                      <td style={{ color: '#dc2626' }}>{r.absentDays}</td>
                      <td>{r.actualHours}h</td>
                      <td>{r.lateMinutes}m</td>
                      <td style={{ color: r.lateDeduction > 0 ? '#dc2626' : 'inherit' }}>£{(r.lateDeduction || 0).toFixed(2)}</td>
                      <td style={{ fontWeight: 700, color: '#2563eb' }}>£{(r.attendancePay || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {(!weeklyAttendanceData.records || weeklyAttendanceData.records.length === 0) && (
                    <tr>
                      <td colSpan="12" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No weekly attendance records found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. TAB: WEEKLY SALARY REPORT                             */}
      {/* ======================================================== */}
      {activeTab === 'weekly_salary' && weeklySalaryData && (
        <div>
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card">
              <div className="stat-lbl">Total Finalized Salary</div>
              <div className="stat-val" style={{ color: '#2563eb' }}>£{(weeklySalaryData.totals?.totalFinalSalary || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Staff count: {weeklySalaryData.count || 0}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="stat-lbl">Disbursed / Paid</div>
              <div className="stat-val" style={{ color: '#059669' }}>£{(weeklySalaryData.totals?.totalPaid || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Attendance: £{(weeklySalaryData.totals?.totalAttendancePay || 0).toFixed(2)}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="stat-lbl">Outstanding Balance</div>
              <div className="stat-val" style={{ color: '#dc2626' }}>£{(weeklySalaryData.totals?.totalOutstanding || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Remaining Liability</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Allowances & Bonus</div>
              <div className="stat-val">£{((weeklySalaryData.totals?.totalAllowances || 0) + (weeklySalaryData.totals?.totalBonus || 0)).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Bonus: £{(weeklySalaryData.totals?.totalBonus || 0).toFixed(2)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '16px' }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => handleDownload('/reports/weekly-salary/excel', { date: selectedDate, shopId: selectedShop || undefined, employeeId: selectedEmployee || undefined }, `Weekly_Salary_${selectedDate}.xlsx`)}
            >
              <Download size={14} /> Export Excel
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => handleDownload('/reports/weekly-salary/pdf', { date: selectedDate, shopId: selectedShop || undefined, employeeId: selectedEmployee || undefined }, `Weekly_Salary_${selectedDate}.pdf`)}
            >
              <Download size={14} /> Export PDF
            </button>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Shop</th>
                    <th>ID</th>
                    <th>Employee Name</th>
                    <th>Week</th>
                    <th>Attendance Pay</th>
                    <th>Allowances</th>
                    <th>Bonus</th>
                    <th>Deductions</th>
                    <th>Final Salary</th>
                    <th>Paid</th>
                    <th>Outstanding</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklySalaryData.salaries?.map(s => {
                    const allow = (s.travelAllowance || 0) + (s.otherAllowances || 0);
                    return (
                      <tr key={s._id}>
                        <td style={{ fontWeight: 600 }}>{s.shopName}</td>
                        <td>{s.employeeId}</td>
                        <td style={{ fontWeight: 500 }}>{s.employeeName}</td>
                        <td style={{ fontSize: '12px' }}>{s.weekLabel}</td>
                        <td>£{(s.netAttendancePay || 0).toFixed(2)}</td>
                        <td>£{allow.toFixed(2)}</td>
                        <td>£{(s.bonus || 0).toFixed(2)}</td>
                        <td style={{ color: s.manualDeductions > 0 ? '#dc2626' : 'inherit' }}>£{(s.manualDeductions || 0).toFixed(2)}</td>
                        <td style={{ fontWeight: 700, color: '#2563eb' }}>£{(s.finalSalary || 0).toFixed(2)}</td>
                        <td style={{ fontWeight: 600, color: '#059669' }}>£{(s.totalPaid || 0).toFixed(2)}</td>
                        <td style={{ fontWeight: 600, color: s.balanceRemaining > 0 ? '#dc2626' : '#64748b' }}>
                          £{(s.balanceRemaining || 0).toFixed(2)}
                        </td>
                        <td>
                          <span className={`badge ${s.status === 'PAID' ? 'badge-success' : s.status === 'PARTIALLY_PAID' ? 'badge-warning' : 'badge-info'}`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {(!weeklySalaryData.salaries || weeklySalaryData.salaries.length === 0) && (
                    <tr>
                      <td colSpan="12" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No weekly salary records found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. TAB: EMPLOYEE MONTHLY REPORT                          */}
      {/* ======================================================== */}
      {activeTab === 'employee_monthly' && monthlyData && (
        <div>
          {/* Monthly KPI Overview */}
          <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                {monthlyData.employeeName} ({monthlyData.employeeId})
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                Location: {monthlyData.shopName} | Period: {monthlyData.monthLabel}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => downloadMonthlyReport('excel')}
                disabled={Boolean(downloadingMonthlyReport)}
                className="btn btn-outline btn-sm"
              >
                <Download size={14} /> {downloadingMonthlyReport === 'excel' ? 'Preparing Excel...' : 'Export Excel'}
              </button>
              <button
                type="button"
                onClick={() => downloadMonthlyReport('pdf')}
                disabled={Boolean(downloadingMonthlyReport)}
                className="btn btn-outline btn-sm"
              >
                <Download size={14} /> {downloadingMonthlyReport === 'pdf' ? 'Preparing PDF...' : 'Export PDF'}
              </button>
            </div>
          </div>

          {/* Monthly Attendance Card */}
          <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0', color: '#334155' }}>
              Month Attendance Summary ({monthlyData.monthLabel})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', textAlign: 'center' }}>
              <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{monthlyData.attendanceSummary?.workingDays || 0}</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>WORK DAYS</div>
              </div>
              <div style={{ background: '#ecfdf5', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#059669' }}>{monthlyData.attendanceSummary?.present || 0}</div>
                <div style={{ fontSize: '11px', color: '#065f46' }}>PRESENT</div>
              </div>
              <div style={{ background: '#fffbeb', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#d97706' }}>{monthlyData.attendanceSummary?.late || 0}</div>
                <div style={{ fontSize: '11px', color: '#92400e' }}>LATE</div>
              </div>
              <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#2563eb' }}>{monthlyData.attendanceSummary?.actualHours || 0}h</div>
                <div style={{ fontSize: '11px', color: '#1e40af' }}>WORKED (H)</div>
              </div>
              <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#dc2626' }}>£{(monthlyData.attendanceSummary?.lateDeduction || 0).toFixed(2)}</div>
                <div style={{ fontSize: '11px', color: '#991b1b' }}>LATE DED</div>
              </div>
              <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#16a34a' }}>£{(monthlyData.attendanceSummary?.attendancePay || 0).toFixed(2)}</div>
                <div style={{ fontSize: '11px', color: '#14532d' }}>NET ATT PAY</div>
              </div>
            </div>
          </div>

          {/* Weekly Salary & Payment Breakdown Table */}
          <div className="card">
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 14px 0', color: '#334155' }}>
              Weekly Payroll & Payment Breakdown
            </h3>
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Week Dates</th>
                    <th>Days</th>
                    <th>Wage (£)</th>
                    <th>Deduction (£)</th>
                    <th>Bonus (£)</th>
                    <th>Total (£)</th>
                    <th>Payment Date</th>
                    <th>Cash (£)</th>
                    <th>Bank (£)</th>
                    <th>Total Paid (£)</th>
                    <th>Balance (£)</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.weeklyBreakdowns?.map((w, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{w.weekDates}</td>
                      <td>{w.days || '-'}</td>
                      <td>£{(w.wage || 0).toFixed(2)}</td>
                      <td style={{ color: w.ded > 0 ? '#dc2626' : 'inherit' }}>£{(w.ded || 0).toFixed(2)}</td>
                      <td>£{(w.bonus || 0).toFixed(2)}</td>
                      <td style={{ fontWeight: 700, color: '#2563eb' }}>£{(w.total || 0).toFixed(2)}</td>
                      <td>{w.receivedDate || '-'}</td>
                      <td>£{(w.cash || 0).toFixed(2)}</td>
                      <td>£{(w.bank || 0).toFixed(2)}</td>
                      <td style={{ fontWeight: 600, color: '#059669' }}>£{(w.paymentTotal || 0).toFixed(2)}</td>
                      <td style={{ fontWeight: 600, color: w.balance > 0 ? '#dc2626' : '#64748b' }}>
                        £{(w.balance || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {/* Grand Totals */}
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td>Grand Total ({monthlyData.monthLabel})</td>
                    <td>{monthlyData.grandTotal?.days || 0}</td>
                    <td>£{(monthlyData.grandTotal?.wage || 0).toFixed(2)}</td>
                    <td>£{(monthlyData.grandTotal?.ded || 0).toFixed(2)}</td>
                    <td>£{(monthlyData.grandTotal?.bonus || 0).toFixed(2)}</td>
                    <td style={{ color: '#2563eb' }}>£{(monthlyData.grandTotal?.total || 0).toFixed(2)}</td>
                    <td>-</td>
                    <td>£{(monthlyData.grandTotal?.cash || 0).toFixed(2)}</td>
                    <td>£{(monthlyData.grandTotal?.bank || 0).toFixed(2)}</td>
                    <td style={{ color: '#059669' }}>£{(monthlyData.grandTotal?.paid || 0).toFixed(2)}</td>
                    <td style={{ color: monthlyData.balancePayable > 0 ? '#dc2626' : '#64748b' }}>
                      £{(monthlyData.balancePayable || 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Total Balance Payable Banner */}
            <div style={{ marginTop: '16px', padding: '14px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#065f46' }}>TOTAL OUTSTANDING BALANCE PAYABLE:</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#059669' }}>£{(monthlyData.balancePayable || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. TAB: EMPLOYEE YEARLY REPORT                           */}
      {/* ======================================================== */}
      {activeTab === 'employee_yearly' && yearlyData && (
        <div>
          <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                {yearlyData.employeeName} ({yearlyData.employeeId})
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                Location: {yearlyData.shopName} | Annual Payroll Year: {yearlyData.year}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => handleDownload('/reports/employee-yearly/excel', { employeeId: selectedEmployee, year: selectedYear }, `Employee_Yearly_${selectedEmployee}_${selectedYear}.xlsx`)}
              >
                <Download size={14} /> Export Excel
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => handleDownload('/reports/employee-yearly/pdf', { employeeId: selectedEmployee, year: selectedYear }, `Employee_Yearly_${selectedEmployee}_${selectedYear}.pdf`)}
              >
                <Download size={14} /> Export PDF
              </button>
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Work Days</th>
                    <th>Worked (h)</th>
                    <th>Attendance Pay</th>
                    <th>Allowances</th>
                    <th>Bonus</th>
                    <th>Deductions</th>
                    <th>Final Salary</th>
                    <th>Paid</th>
                    <th>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyData.monthlyRows?.map(m => (
                    <tr key={m.monthNumber}>
                      <td style={{ fontWeight: 600 }}>{m.monthName}</td>
                      <td>{m.workingDays}</td>
                      <td>{m.actualHours}h</td>
                      <td>£{(m.attendancePay || 0).toFixed(2)}</td>
                      <td>£{(m.allowances || 0).toFixed(2)}</td>
                      <td>£{(m.bonus || 0).toFixed(2)}</td>
                      <td style={{ color: m.deductions > 0 ? '#dc2626' : 'inherit' }}>£{(m.deductions || 0).toFixed(2)}</td>
                      <td style={{ fontWeight: 700, color: '#2563eb' }}>£{(m.finalSalary || 0).toFixed(2)}</td>
                      <td style={{ fontWeight: 600, color: '#059669' }}>£{(m.paid || 0).toFixed(2)}</td>
                      <td style={{ fontWeight: 600, color: m.outstanding > 0 ? '#dc2626' : '#64748b' }}>
                        £{(m.outstanding || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {/* Annual Totals */}
                  <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                    <td>ANNUAL TOTAL ({yearlyData.year})</td>
                    <td>{yearlyData.yearlyTotals?.totalWorkingDays || 0}</td>
                    <td>{yearlyData.yearlyTotals?.totalActualHours || 0}h</td>
                    <td>£{(yearlyData.yearlyTotals?.totalAttendancePay || 0).toFixed(2)}</td>
                    <td>£{(yearlyData.yearlyTotals?.totalAllowances || 0).toFixed(2)}</td>
                    <td>£{(yearlyData.yearlyTotals?.totalBonus || 0).toFixed(2)}</td>
                    <td>£{(yearlyData.yearlyTotals?.totalDeductions || 0).toFixed(2)}</td>
                    <td style={{ color: '#2563eb' }}>£{(yearlyData.yearlyTotals?.totalFinalSalary || 0).toFixed(2)}</td>
                    <td style={{ color: '#059669' }}>£{(yearlyData.yearlyTotals?.totalPaid || 0).toFixed(2)}</td>
                    <td style={{ color: (yearlyData.yearlyTotals?.totalOutstanding || 0) > 0 ? '#dc2626' : '#64748b' }}>
                      £{(yearlyData.yearlyTotals?.totalOutstanding || 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. TAB: BONUS & COMMISSION REPORT                        */}
      {/* ======================================================== */}
      {activeTab === 'bonus' && bonusData && (
        <div>
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card">
              <div className="stat-lbl">Qualified Staff</div>
              <div className="stat-val">{bonusData.count || 0}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Month: {selectedMonth} {selectedYear}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="stat-lbl">Total Sales Logged</div>
              <div className="stat-val" style={{ color: '#d97706' }}>£{(bonusData.totals?.totalSales || 0).toLocaleString()}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Retail Bicycle Sales</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="stat-lbl">Total Commission Payable</div>
              <div className="stat-val" style={{ color: '#059669' }}>£{(bonusData.totals?.totalBonus || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Sales Incentives</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '16px' }}>
            <a
              href={`${API_BASE_URL}/reports/bonus/excel?month=${selectedMonth}&year=${selectedYear}&employeeId=${selectedEmployee}&shopId=${selectedShop}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              <Download size={14} /> Export Excel
            </a>
            <a
              href={`${API_BASE_URL}/reports/bonus/pdf?month=${selectedMonth}&year=${selectedYear}&employeeId=${selectedEmployee}&shopId=${selectedShop}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              <Download size={14} /> Export PDF
            </a>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>ID</th>
                    <th>Shop</th>
                    <th>Commitment / Tier</th>
                    <th>Monthly Sale</th>
                    <th>Rate</th>
                    <th>Calculated Bonus</th>
                    <th>Date Logged</th>
                  </tr>
                </thead>
                <tbody>
                  {bonusData.bonuses?.map(b => (
                    <tr key={b._id}>
                      <td style={{ fontWeight: 600 }}>{b.employeeName}</td>
                      <td>{b.employeeId}</td>
                      <td>{b.shopName}</td>
                      <td>{b.commitmentText || `${b.bonusPercentage}% - ${b.shopName}`}</td>
                      <td style={{ fontWeight: 600 }}>£{(b.salesAmount || 0).toLocaleString()}</td>
                      <td>{b.bonusPercentage}%</td>
                      <td style={{ fontWeight: 700, color: '#059669' }}>£{(b.bonusAmount || 0).toFixed(2)}</td>
                      <td style={{ fontSize: '12px', color: '#64748b' }}>{new Date(b.createdAt).toLocaleDateString('en-GB')}</td>
                    </tr>
                  ))}
                  {(!bonusData.bonuses || bonusData.bonuses.length === 0) && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No bonus or commission records found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. TAB: SHOP LABOUR HOURS REPORT                         */}
      {/* ======================================================== */}
      {activeTab === 'shop_labour' && labourData && (
        <div>
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card">
              <div className="stat-lbl">Active Locations</div>
              <div className="stat-val">{labourData.count || 0}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Total Shops Reporting</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
              <div className="stat-lbl">Total Actual Hours</div>
              <div className="stat-val" style={{ color: '#2563eb' }}>{(labourData.grandTotals?.totalActualHours || 0).toFixed(1)}h</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Scheduled: {(labourData.grandTotals?.totalScheduledHours || 0).toFixed(1)}h</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="stat-lbl">Attendance Wage Cost</div>
              <div className="stat-val" style={{ color: '#059669' }}>£{(labourData.grandTotals?.totalWageCost || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Working Days: {labourData.grandTotals?.totalWorkingDays || 0}</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '16px' }}>
            <a
              href={`${API_BASE_URL}/reports/shop-labour/excel?startDate=${startDate}&endDate=${endDate}&shopId=${selectedShop}&employeeId=${selectedEmployee}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              <Download size={14} /> Export Excel
            </a>
            <a
              href={`${API_BASE_URL}/reports/shop-labour/pdf?startDate=${startDate}&endDate=${endDate}&shopId=${selectedShop}&employeeId=${selectedEmployee}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              <Download size={14} /> Export PDF
            </a>
          </div>

          {labourData.data?.map((shop, sIdx) => (
            <div key={sIdx} className="card" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
                  🏬 {shop.shopName} ({shop.employeeCount} staff)
                </h3>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#2563eb' }}>
                  Total Hours: {shop.totalHours}h | Wage Cost: £{shop.totalWageCost.toFixed(2)}
                </span>
              </div>
              <div className="table-responsive">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>ID</th>
                      <th>Work Days</th>
                      <th>Scheduled (h)</th>
                      <th>Actual Worked (h)</th>
                      <th>Late (m)</th>
                      <th>Wage Cost (£)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shop.employees?.map((e, eIdx) => (
                      <tr key={eIdx}>
                        <td style={{ fontWeight: 500 }}>{e.employeeName}</td>
                        <td>{e.employeeId}</td>
                        <td>{e.workingDays}</td>
                        <td>{e.scheduledHours}h</td>
                        <td style={{ fontWeight: 600 }}>{e.hours}h</td>
                        <td>{e.lateMinutes}m</td>
                        <td style={{ fontWeight: 700, color: '#2563eb' }}>£{e.wageCost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================================================== */}
      {/* 8. TAB: SALARY PAYMENTS REPORT                           */}
      {/* ======================================================== */}
      {activeTab === 'payments' && paymentsData && (
        <div>
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card">
              <div className="stat-lbl">Total Payments Count</div>
              <div className="stat-val">{paymentsData.totals?.paymentCount || 0}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Transactions Disbursed</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="stat-lbl">Total Disbursed</div>
              <div className="stat-val" style={{ color: '#059669' }}>£{(paymentsData.totals?.totalPaid || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Wages Paid Out</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
              <div className="stat-lbl">Cash Disbursed</div>
              <div className="stat-val" style={{ color: '#2563eb' }}>£{(cashBankSummary?.cash?.totalAmount || paymentsData.totals?.cashTotal || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{cashBankSummary?.cash?.count || paymentsData.totals?.cashCount || 0} Transactions</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
              <div className="stat-lbl">Bank Transfers</div>
              <div className="stat-val" style={{ color: '#7c3aed' }}>£{(cashBankSummary?.bank?.totalAmount || paymentsData.totals?.bankTotal || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{cashBankSummary?.bank?.count || paymentsData.totals?.bankCount || 0} Transfers</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '16px' }}>
            <a
              href={`${API_BASE_URL}/reports/payments/excel?startDate=${startDate}&endDate=${endDate}&shopId=${selectedShop}&employeeId=${selectedEmployee}&paymentMethod=${paymentMethod}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              <Download size={14} /> Export Excel
            </a>
            <a
              href={`${API_BASE_URL}/reports/payments/pdf?startDate=${startDate}&endDate=${endDate}&shopId=${selectedShop}&employeeId=${selectedEmployee}&paymentMethod=${paymentMethod}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              <Download size={14} /> Export PDF
            </a>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>ID</th>
                    <th>Shop</th>
                    <th>Salary Week</th>
                    <th>Payment Date</th>
                    <th>Amount (£)</th>
                    <th>Method</th>
                    <th>Paid By</th>
                    <th>Notes / Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsData.payments?.map(p => (
                    <tr key={p._id}>
                      <td style={{ fontWeight: 600 }}>{p.employeeName}</td>
                      <td>{p.employeeId}</td>
                      <td>{p.shopName}</td>
                      <td style={{ fontSize: '12px' }}>{p.weekLabel}</td>
                      <td>{new Date(p.paymentDate).toLocaleDateString('en-GB')}</td>
                      <td style={{ fontWeight: 700, color: '#059669' }}>£{(p.amount || 0).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${p.paymentMethod === 'Cash' ? 'badge-warning' : 'badge-info'}`}>
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td>{p.paidByName}</td>
                      <td style={{ fontSize: '12px', color: '#64748b' }}>{p.notes || p.clientReference || '-'}</td>
                    </tr>
                  ))}
                  {(!paymentsData.payments || paymentsData.payments.length === 0) && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No payment records found for the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 9. TAB: SALARY LEDGER REPORT                             */}
      {/* ======================================================== */}
      {activeTab === 'ledger' && ledgerData && (
        <div>
          <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                {ledgerData.employee?.name} ({ledgerData.employee?.employeeId})
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                Official Financial Ledger & Running Balance
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <a
                href={`${API_BASE_URL}/reports/ledger/${selectedEmployee}/excel`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline btn-sm"
              >
                <Download size={14} /> Export Excel
              </a>
              <a
                href={`${API_BASE_URL}/reports/ledger/${selectedEmployee}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline btn-sm"
              >
                <Download size={14} /> Export PDF
              </a>
            </div>
          </div>

          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
              <div className="stat-lbl">Total Wages Earned</div>
              <div className="stat-val" style={{ color: '#2563eb' }}>£{(ledgerData.summary?.totalEarned || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Finalized Payroll Total</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="stat-lbl">Total Payments Disbursed</div>
              <div className="stat-val" style={{ color: '#059669' }}>£{(ledgerData.summary?.totalPaid || 0).toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Cash & Bank Total</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="stat-lbl">Current Running Balance</div>
              <div className="stat-val" style={{ color: (ledgerData.summary?.outstanding || 0) > 0 ? '#dc2626' : '#10b981' }}>
                £{(ledgerData.summary?.outstanding || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Amount Owed by Company</div>
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction Type</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th>Earned / Credit (£)</th>
                    <th>Paid / Debit (£)</th>
                    <th>Running Balance (£)</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.transactions?.map(t => (
                    <tr key={t._id}>
                      <td>{new Date(t.date).toLocaleDateString('en-GB')}</td>
                      <td>
                        <span className={`badge ${t.transactionType === 'SALARY_EARNED' ? 'badge-primary' : 'badge-success'}`}>
                          {t.transactionType.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{t.description}</td>
                      <td>{t.referenceType}</td>
                      <td style={{ fontWeight: 600, color: t.amountEarned > 0 ? '#2563eb' : 'inherit' }}>
                        {t.amountEarned > 0 ? `£${t.amountEarned.toFixed(2)}` : '-'}
                      </td>
                      <td style={{ fontWeight: 600, color: t.amountPaid > 0 ? '#059669' : 'inherit' }}>
                        {t.amountPaid > 0 ? `£${t.amountPaid.toFixed(2)}` : '-'}
                      </td>
                      <td style={{ fontWeight: 700, color: '#0f172a' }}>
                        £{(t.runningBalance || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {(!ledgerData.transactions || ledgerData.transactions.length === 0) && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No ledger transactions found for this employee.
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
