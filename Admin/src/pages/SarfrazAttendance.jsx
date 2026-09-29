import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth, API_BASE_URL } from '../context/AuthContext';
import { formatTime12Hour } from '../utils/formatTime';
import {
  Check,
  Edit,
  Download,
  MessageSquare,
  RefreshCw,
  CheckCheck,
  X,
  Eye,
  Lock,
  Search,
  AlertCircle,
  Share2,
  Clock,
  UserCheck,
  Calendar,
  Building2,
  ShieldCheck,
  Info
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

async function getAttendanceExportErrorMessage(error, format) {
  const fallback = `Unable to export ${format.toUpperCase()} attendance report.`;
  const responseData = error.response?.data;
  if (responseData instanceof Blob) {
    const contentType = error.response?.headers?.['content-type'] || '';
    if (contentType.includes('application/json')) {
      const responseText = await responseData.text();
      try {
        const payload = JSON.parse(responseText);
        return payload.message || fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
  return responseData?.message || fallback;
}

export default function SarfrazAttendance() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    totalEmployees: 0,
    present: 0,
    late: 0,
    half: 0,
    absent: 0,
    pendingReview: 0,
    checked: 0,
    totalScheduledHours: 0,
    totalWorkedHours: 0,
    totalDailyWages: 0,
    totalLateDeductions: 0,
    totalAttendancePay: 0
  });

  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);

  // Modals
  const [editModalRecord, setEditModalRecord] = useState(null);
  const [detailModalRecord, setDetailModalRecord] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false, type: 'single', recordId: null, count: 0 });
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [whatsAppText, setWhatsAppText] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // Filters
  const [selectedDate, setSelectedDate] = useState(() => {
    // Current UK date representation
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [selectedShop, setSelectedShop] = useState('');
  const [approvalStatusFilter, setApprovalStatusFilter] = useState('All');
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [shops, setShops] = useState([]);

  useEffect(() => {
    fetchShops();
  }, []);

  useEffect(() => {
    fetchAttendanceData();
  }, [selectedDate, selectedShop, approvalStatusFilter, attendanceStatusFilter, searchQuery]);

  const fetchShops = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/shops`);
      if (res.data.success) {
        setShops(res.data.shops || []);
      }
    } catch (err) {
      console.error('Error fetching shops:', err);
    }
  };

  const fetchAttendanceData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedDate) params.date = selectedDate;
      if (selectedShop) params.shopId = selectedShop;
      if (approvalStatusFilter && approvalStatusFilter !== 'All') params.approvalStatus = approvalStatusFilter;
      if (attendanceStatusFilter && attendanceStatusFilter !== 'All') params.status = attendanceStatusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await axios.get(`${API_BASE_URL}/reports/daily-attendance`, { params });
      if (res.data.success) {
        setRecords(res.data.records || []);
        if (res.data.summary) {
          setSummary(res.data.summary);
        }
        if (res.data.whatsAppText) {
          setWhatsAppText(res.data.whatsAppText);
        }
        setSelectedIds([]);
      }
    } catch (err) {
      console.error('Error fetching attendance report:', err);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (msg, isError = false) => {
    setFeedbackMsg({ text: msg, isError });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Selection handlers (only pending records can be selected for batch checking)
  const pendingRecords = records.filter(r => r.approvalStatus === 'Pending Review' || r.approvalStatus === 'Draft');

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(pendingRecords.map(r => r._id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Confirmation modal triggers
  const promptCheckSingle = (id) => {
    setConfirmModal({
      open: true,
      type: 'single',
      recordId: id,
      count: 1
    });
  };

  const promptCheckBatch = () => {
    if (!selectedIds.length) return;
    setConfirmModal({
      open: true,
      type: 'batch',
      recordId: null,
      count: selectedIds.length
    });
  };

  const executeCheckAttendance = async () => {
    const isBatch = confirmModal.type === 'batch';
    const targetIds = isBatch ? selectedIds : [confirmModal.recordId];
    setConfirmModal({ open: false, type: 'single', recordId: null, count: 0 });

    try {
      const res = await axios.post(`${API_BASE_URL}/attendance/approve`, { ids: targetIds });
      if (res.data.success) {
        showNotification(res.data.message || `Successfully checked and approved ${targetIds.length} record(s).`);
        fetchAttendanceData();
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Approval failed.', true);
    }
  };

  // Edit attendance handler
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editModalRecord) return;

    try {
      const res = await axios.put(`${API_BASE_URL}/attendance/${editModalRecord._id}`, editModalRecord);
      if (res.data.success) {
        setEditModalRecord(null);
        showNotification('Attendance recalculated and saved successfully.');
        fetchAttendanceData();
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Update failed.', true);
    }
  };

  // Export handlers
  const handleShareWhatsApp = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `PixxTechnologies Attendance - ${selectedDate}`,
          text: whatsAppText
        });
      } catch (err) {
        // User cancelled share
      }
    } else {
      copyWhatsAppToClipboard();
    }
  };

  const copyWhatsAppToClipboard = () => {
    navigator.clipboard.writeText(whatsAppText);
    showNotification('WhatsApp report copied to clipboard!');
  };

  const downloadAttendanceExport = async (format) => {
    const params = new URLSearchParams();
    if (selectedDate) params.append('date', selectedDate);
    if (selectedShop) params.append('shopId', selectedShop);
    if (approvalStatusFilter && approvalStatusFilter !== 'All') params.append('approvalStatus', approvalStatusFilter);
    if (attendanceStatusFilter && attendanceStatusFilter !== 'All') params.append('status', attendanceStatusFilter);
    if (searchQuery.trim()) params.append('search', searchQuery.trim());

    const isPdf = format === 'pdf';
    const mimeType = isPdf
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const shopName = shops.find(shop => shop._id === selectedShop)?.name || 'All-Shops';
    const safeShop = shopName.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'All-Shops';
    const extension = isPdf ? 'pdf' : 'xlsx';
    const fileName = `PIXX_Attendance_${safeShop}_${selectedDate}.${extension}`;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/reports/daily-attendance/${format}?${params.toString()}`,
        { responseType: 'blob' }
      );
      const file = new File([response.data], fileName, { type: mimeType });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({ files: [file], title: fileName });
          return;
        } catch (shareError) {
          if (shareError.name === 'AbortError') return;
          console.warn('Sharing attendance report failed; downloading it instead:', shareError.name);
        }
      }

      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      showNotification(`${isPdf ? 'PDF' : 'Excel'} attendance report downloaded.`);
    } catch (error) {
      console.error('Attendance report export failed:', format, error.response?.status || 'network error');
      showNotification(await getAttendanceExportErrorMessage(error, format), true);
    }
  };

  const downloadExcel = () => downloadAttendanceExport('excel');

  return (
    <div className="page-container">
      {/* Toast Notification */}
      {feedbackMsg && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: feedbackMsg.isError ? '#ef4444' : '#10b981',
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
          {feedbackMsg.isError ? <AlertCircle size={16} /> : <CheckCheck size={16} />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Attendance Checking & Review
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
              <ShieldCheck size={12} /> Sarfraz Review
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', margin: 0 }}>
            Audit daily records, verify actual hours, calculate deductions & check to lock.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setWhatsAppModalOpen(true)}
            title="View & copy WhatsApp report"
          >
            <MessageSquare size={15} color="#16a34a" /> WhatsApp Report
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={downloadExcel}
            title="Download formatted Excel report"
          >
            <Download size={15} /> Export Excel
          </button>

          <button
            className="btn btn-success btn-sm"
            onClick={promptCheckBatch}
            disabled={!selectedIds.length}
            style={{ fontWeight: 600 }}
          >
            <CheckCheck size={16} /> Check Selected ({selectedIds.length})
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stat-grid" style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div className="stat-card" style={{ padding: '12px 14px' }}>
          <div className="stat-lbl">Total Staff</div>
          <div className="stat-val" style={{ fontSize: '20px' }}>{summary.totalEmployees}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px', borderLeft: '3px solid #16a34a' }}>
          <div className="stat-lbl" style={{ color: '#16a34a' }}>Present</div>
          <div className="stat-val" style={{ fontSize: '20px', color: '#16a34a' }}>{summary.present}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px', borderLeft: '3px solid #d97706' }}>
          <div className="stat-lbl" style={{ color: '#d97706' }}>Late</div>
          <div className="stat-val" style={{ fontSize: '20px', color: '#d97706' }}>{summary.late}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px', borderLeft: '3px solid #0284c7' }}>
          <div className="stat-lbl" style={{ color: '#0284c7' }}>Half Day</div>
          <div className="stat-val" style={{ fontSize: '20px', color: '#0284c7' }}>{summary.half}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px', borderLeft: '3px solid #dc2626' }}>
          <div className="stat-lbl" style={{ color: '#dc2626' }}>Absent</div>
          <div className="stat-val" style={{ fontSize: '20px', color: '#dc2626' }}>{summary.absent}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px', borderLeft: '3px solid #f97316' }}>
          <div className="stat-lbl" style={{ color: '#f97316' }}>Pending Review</div>
          <div className="stat-val" style={{ fontSize: '20px', color: '#f97316' }}>{summary.pendingReview}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 14px', borderLeft: '3px solid #2563eb' }}>
          <div className="stat-lbl" style={{ color: '#2563eb' }}>Checked</div>
          <div className="stat-val" style={{ fontSize: '20px', color: '#2563eb' }}>{summary.checked}</div>
        </div>
        {isAdmin && <div className="stat-card" style={{ padding: '12px 14px' }}>
          <div className="stat-lbl">Worked Hours</div>
          <div className="stat-val" style={{ fontSize: '20px' }}>{summary.totalWorkedHours}h</div>
        </div>}
        {isAdmin && <div className="stat-card" style={{ padding: '12px 14px' }}>
          <div className="stat-lbl">Attendance Pay</div>
          <div className="stat-val" style={{ fontSize: '20px', color: '#0f172a' }}>£{summary.totalAttendancePay.toFixed(2)}</div>
        </div>}
      </div>

      {/* Multi-Filter Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Date Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={15} color="#64748b" />
            <label className="form-label" style={{ margin: 0, fontSize: '13px' }}>Date:</label>
            <input
              type="date"
              className="form-input"
              style={{ width: '150px', padding: '6px 10px', fontSize: '13px' }}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          {/* Shop Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={15} color="#64748b" />
            <label className="form-label" style={{ margin: 0, fontSize: '13px' }}>Shop:</label>
            <select
              className="form-select"
              style={{ width: '180px', padding: '6px 10px', fontSize: '13px' }}
              value={selectedShop}
              onChange={(e) => setSelectedShop(e.target.value)}
            >
              <option value="">All 6 Shops</option>
              {shops.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>

          {/* Approval Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '13px' }}>Approval:</label>
            <select
              className="form-select"
              style={{ width: '150px', padding: '6px 10px', fontSize: '13px' }}
              value={approvalStatusFilter}
              onChange={(e) => setApprovalStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Pending Review">Pending Review</option>
              <option value="Checked">Checked</option>
            </select>
          </div>

          {/* Attendance Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '13px' }}>Status:</label>
            <select
              className="form-select"
              style={{ width: '130px', padding: '6px 10px', fontSize: '13px' }}
              value={attendanceStatusFilter}
              onChange={(e) => setAttendanceStatusFilter(e.target.value)}
            >
              <option value="All">All Staff</option>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Half">Half Day</option>
              <option value="Absent">Absent</option>
            </select>
          </div>

          {/* Search by Name or ID */}
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

          {/* Refresh Button */}
          <button
            className="btn btn-outline btn-sm"
            onClick={fetchAttendanceData}
            title="Refresh attendance records"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Review Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive" style={{ border: 'none' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '36px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={pendingRecords.length > 0 && selectedIds.length === pendingRecords.length}
                    onChange={handleSelectAll}
                    disabled={pendingRecords.length === 0}
                    title="Select all pending review records"
                  />
                </th>
                <th>Employee</th>
                <th>Shop</th>
                <th>Shift Schedule</th>
                <th>Actual Hours</th>
                <th>Late (Mins)</th>
                <th>Status</th>
                {isAdmin && <th>Daily Wage</th>}
                {isAdmin && <th>Late Ded.</th>}
                {isAdmin && <th>Net Pay</th>}
                <th>Review Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.slice().sort((a, b) => {
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
                const isChecked = ['Checked', 'Finalized'].includes(r.approvalStatus);
                const canEdit = !isChecked || isAdmin;

                return (
                  <tr key={r._id} style={{ background: isChecked ? '#fafafa' : r.status === 'Absent' ? '#fffafb' : '#ffffff' }}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r._id)}
                        onChange={() => toggleSelect(r._id)}
                        disabled={isChecked}
                      />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.employeeName}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{r.employeeId}</div>
                    </td>
                    <td>
                      {r.status === 'Absent' ? (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
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
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: getShopBadgeStyle(r.shopName).bg,
                          color: getShopBadgeStyle(r.shopName).color,
                          border: `1px solid ${getShopBadgeStyle(r.shopName).border}`
                        }}>
                          {r.shopName || '—'}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                        {r.status === 'Absent' ? '—' : `${formatTime12Hour(r.shiftStart)} – ${formatTime12Hour(r.shiftEnd)}`}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                        {r.status === 'Absent' ? 'Absent / Off' : `${formatTime12Hour(r.timeReached)} – ${formatTime12Hour(r.workerEndTime)}`}
                      </span>
                      {r.status !== 'Absent' && <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {r.actualHours != null ? `${r.actualHours} hrs` : ''}
                      </div>}
                    </td>
                    <td>
                      {r.status === 'Absent' ? (
                        <span style={{ color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>—</span>
                      ) : r.lateMinutes > 0 ? (
                        <span style={{
                          color: r.lateMinutes > 15 ? '#dc2626' : '#d97706',
                          fontWeight: 700,
                          fontSize: '12px'
                        }}>
                          +{r.lateMinutes} min
                        </span>
                      ) : (
                        <span style={{ color: '#16a34a', fontSize: '12px' }}>On-time</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${(r.status || 'present').toLowerCase()}`}>
                        {r.status}
                      </span>
                    </td>
                    {isAdmin && <td style={{ fontSize: '12px' }}>£{r.dailyWage?.toFixed(2)}</td>}
                    {isAdmin && (
                      <td style={{
                        color: r.lateDeduction > 0 ? '#dc2626' : '#64748b',
                        fontWeight: r.lateDeduction > 0 ? 700 : 400,
                        fontSize: '12px'
                      }}>
                        £{r.lateDeduction ? r.lateDeduction.toFixed(2) : '0.00'}
                      </td>
                    )}
                    {isAdmin && (
                      <td style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                        £{r.attendancePay ? r.attendancePay.toFixed(2) : '0.00'}
                      </td>
                    )}
                    <td>
                      {isChecked ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: '#ecfdf5',
                          color: '#047857',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600
                        }}>
                          <Lock size={11} /> Checked
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: '#fff7ed',
                          color: '#c2410c',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600
                        }}>
                          <Clock size={11} /> Pending
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '5px' }}>
                        {/* View Detail */}
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ padding: '4px 8px' }}
                          onClick={() => setDetailModalRecord(r)}
                          title="View Audit & Wage Details"
                        >
                          <Eye size={13} />
                        </button>

                        {/* Edit Button */}
                        {canEdit ? (
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: '4px 8px' }}
                            onClick={() => setEditModalRecord({ ...r })}
                            title="Edit times and status"
                          >
                            <Edit size={13} />
                          </button>
                        ) : (
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: '4px 8px', opacity: 0.5, cursor: 'not-allowed' }}
                            disabled
                            title="Locked: Checked records cannot be edited by Checker"
                          >
                            <Lock size={13} />
                          </button>
                        )}

                        {/* Check / Approve Button */}
                        {!isChecked && (
                          <button
                            className="btn btn-success btn-sm"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => promptCheckSingle(r._id)}
                            title="Check and lock record"
                          >
                            <Check size={13} /> Check
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {records.length === 0 && !loading && (
                <tr>
                  <td colSpan="12" style={{ textAlign: 'center', padding: '48px 16px', color: '#94a3b8' }}>
                    <div style={{ fontSize: '18px', marginBottom: '8px' }}>📋 No attendance records found</div>
                    <div style={{ fontSize: '13px' }}>Try selecting a different date, shop, or adjusting your filter criteria.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal for Check/Lock */}
      {confirmModal.open && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                <ShieldCheck size={20} color="#16a34a" /> Confirm Check Attendance
              </h2>
              <button
                onClick={() => setConfirmModal({ open: false, type: 'single', recordId: null, count: 0 })}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, margin: 0 }}>
                Are you sure this attendance record is correct and ready to be checked?
              </p>
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: '#fffbeb',
                border: '1px solid #fef3c7',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#b45309',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Strict Locking Notice:</strong> Once checked, {confirmModal.count > 1 ? `these ${confirmModal.count} records` : 'this record'} will be locked from further edits by Usman and Sarfraz. Only an Administrator can modify checked records.
                </span>
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="btn btn-outline"
                onClick={() => setConfirmModal({ open: false, type: 'single', recordId: null, count: 0 })}
              >
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={executeCheckAttendance}
              >
                <CheckCheck size={16} /> Yes, Confirm & Lock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {editModalRecord && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                Edit Attendance: {editModalRecord.employeeName}
              </h2>
              <button
                onClick={() => setEditModalRecord(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Shift Start</label>
                    <input
                      type="time"
                      lang="en-US"
                      className="form-input"
                      value={editModalRecord.shiftStart || ''}
                      onChange={(e) => setEditModalRecord({ ...editModalRecord, shiftStart: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Shift End</label>
                    <input
                      type="time"
                      lang="en-US"
                      className="form-input"
                      value={editModalRecord.shiftEnd || ''}
                      onChange={(e) => setEditModalRecord({ ...editModalRecord, shiftEnd: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Actual Arrival (Time Reached)</label>
                    <input
                      type="time"
                      lang="en-US"
                      className="form-input"
                      value={editModalRecord.timeReached || ''}
                      onChange={(e) => setEditModalRecord({ ...editModalRecord, timeReached: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Actual Leave (Worker End Time)</label>
                    <input
                      type="time"
                      lang="en-US"
                      className="form-input"
                      value={editModalRecord.workerEndTime || ''}
                      onChange={(e) => setEditModalRecord({ ...editModalRecord, workerEndTime: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={editModalRecord.status}
                    onChange={(e) => setEditModalRecord({ ...editModalRecord, status: e.target.value })}
                  >
                    <option value="Present">Present</option>
                    <option value="Late">Late</option>
                    <option value="Half">Half Day</option>
                    <option value="Absent">Absent</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Remarks / Correction Notes</label>
                  <textarea
                    className="form-textarea"
                    rows="3"
                    value={editModalRecord.remarks || ''}
                    onChange={(e) => setEditModalRecord({ ...editModalRecord, remarks: e.target.value })}
                    placeholder="e.g. Approved 15 min train delay adjustment"
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditModalRecord(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Recalculate & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      {detailModalRecord && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={18} color="#2563eb" /> Attendance Record Details
              </h2>
              <button
                onClick={() => setDetailModalRecord(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: '13px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Employee</div>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{detailModalRecord.employeeName}</div>
                  <div style={{ color: '#64748b', fontSize: '12px' }}>ID: {detailModalRecord.employeeId}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Shop & Date</div>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>
                    {detailModalRecord.status === 'Absent' ? 'No shop (Absent / Off)' : detailModalRecord.shopName}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '12px' }}>{detailModalRecord.dateString}</div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#475569', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Hours & Shift Timing
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>Scheduled Shift: <strong>{detailModalRecord.status === 'Absent' ? '—' : `${formatTime12Hour(detailModalRecord.shiftStart)} – ${formatTime12Hour(detailModalRecord.shiftEnd)}`}</strong></div>
                  <div>Scheduled Hours: <strong>{detailModalRecord.scheduledHours || 0} hrs</strong></div>
                  <div>Actual Reached/Left: <strong>{detailModalRecord.status === 'Absent' ? 'Absent / Off' : `${formatTime12Hour(detailModalRecord.timeReached)} – ${formatTime12Hour(detailModalRecord.workerEndTime)}`}</strong></div>
                  <div>Actual Hours Worked: <strong>{detailModalRecord.status === 'Absent' ? '—' : `${detailModalRecord.actualHours || 0} hrs`}</strong></div>
                </div>
              </div>

              {isAdmin && <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#475569', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Financial Breakdown
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>Daily Wage Snapshot: <strong>£{detailModalRecord.dailyWage?.toFixed(2)}</strong></div>
                  <div>Hourly Wage: <strong>£{detailModalRecord.hourlyWage ? detailModalRecord.hourlyWage.toFixed(2) : '0.00'}/hr</strong></div>
                  <div>Late Minutes: <strong style={{ color: detailModalRecord.lateMinutes > 0 ? '#d97706' : '#16a34a' }}>{detailModalRecord.lateMinutes || 0} min</strong></div>
                  <div>Late Deduction: <strong style={{ color: detailModalRecord.lateDeduction > 0 ? '#dc2626' : '#64748b' }}>£{detailModalRecord.lateDeduction?.toFixed(2)}</strong></div>
                  <div style={{ gridColumn: 'span 2', paddingTop: '4px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Net Attendance Pay:</span>
                    <strong style={{ fontSize: '15px', color: '#0f172a' }}>£{detailModalRecord.attendancePay?.toFixed(2)}</strong>
                  </div>
                </div>
              </div>}

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#475569', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Audit & Approval Trail
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', fontSize: '12px' }}>
                  <div>Approval Status: <strong>{detailModalRecord.approvalStatus}</strong></div>
                  <div>Created By: <strong>{detailModalRecord.createdByName || 'Usman (Operator)'}</strong> {detailModalRecord.createdAt ? `at ${new Date(detailModalRecord.createdAt).toLocaleString('en-GB')}` : ''}</div>
                  <div>Checked By: <strong>{detailModalRecord.checkedByName || (detailModalRecord.approvalStatus === 'Checked' ? 'Sarfraz Khan' : 'Pending')}</strong> {detailModalRecord.checkedAt ? `at ${new Date(detailModalRecord.checkedAt).toLocaleString('en-GB')}` : ''}</div>
                  <div>Remarks: <em>{detailModalRecord.remarks || 'None'}</em></div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDetailModalRecord(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Report Modal */}
      {whatsAppModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={18} color="#16a34a" /> WhatsApp Daily Attendance Report
              </h2>
              <button
                onClick={() => setWhatsAppModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                Ready-to-send summary formatted for the PixxTechnologies management WhatsApp group:
              </p>
              <textarea
                className="form-textarea"
                rows="14"
                style={{ fontFamily: 'monospace', fontSize: '12px', background: '#f8fafc' }}
                value={whatsAppText}
                readOnly
              />
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-outline" onClick={() => setWhatsAppModalOpen(false)}>
                Close
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline" onClick={handleShareWhatsApp}>
                  <Share2 size={15} /> Share / Copy
                </button>
                <button className="btn btn-success" onClick={copyWhatsAppToClipboard}>
                  📋 Copy to Clipboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
