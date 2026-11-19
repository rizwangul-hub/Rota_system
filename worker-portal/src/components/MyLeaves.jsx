import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Palmtree,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  X,
  FileText,
  UserCheck,
  Send,
  CalendarDays
} from 'lucide-react';

const LEAVE_TYPES = [
  'Annual Leave',
  'Sick Leave',
  'Emergency Leave',
  'Unpaid Leave',
  'Other'
];

export default function MyLeaves() {
  const [leaves, setLeaves] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'Pending' | 'Approved' | 'Rejected'
  const [modalOpen, setModalOpen] = useState(false);

  // Form State
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [leaveType, setLeaveType] = useState('Annual Leave');
  const [startDate, setStartDate] = useState(tomorrow);
  const [endDate, setEndDate] = useState(tomorrow);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  const calculateDays = (start, end) => {
    if (!start || !end) return 0;
    const s = new Date(`${start}T00:00:00Z`);
    const e = new Date(`${end}T00:00:00Z`);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
    return Math.round((e.getTime() - s.getTime()) / (1000 * 3600 * 24)) + 1;
  };

  const computedDays = calculateDays(startDate, endDate);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, summaryRes] = await Promise.all([
        api.get('/worker/leaves'),
        api.get('/worker/leaves/summary')
      ]);

      if (listRes.data?.success) setLeaves(listRes.data.leaves || []);
      if (summaryRes.data?.success) setSummary(summaryRes.data.summary || null);
    } catch (err) {
      console.error('Failed to load leaves:', err);
      setError(err.response?.data?.message || 'Unable to retrieve your leave records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    setFormError('');

    if (computedDays <= 0) {
      setFormError('End date must be on or after the start date.');
      return;
    }

    if (!reason.trim()) {
      setFormError('Please enter a brief reason for your leave.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/worker/leaves', {
        leaveType,
        startDate,
        endDate,
        reason: reason.trim()
      });

      if (res.data?.success) {
        setModalOpen(false);
        setReason('');
        setStartDate(tomorrow);
        setEndDate(tomorrow);
        fetchData();
      }
    } catch (err) {
      console.error('Submit leave error:', err);
      setFormError(err.response?.data?.message || 'Failed to submit leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelLeave = async (leaveId) => {
    if (!window.confirm('Are you sure you want to cancel this pending leave request?')) {
      return;
    }

    setCancellingId(leaveId);
    try {
      const res = await api.post(`/worker/leaves/${leaveId}/cancel`);
      if (res.data?.success) {
        fetchData();
      }
    } catch (err) {
      console.error('Cancel leave error:', err);
      alert(err.response?.data?.message || 'Could not cancel leave request.');
    } finally {
      setCancellingId(null);
    }
  };

  const filteredLeaves = leaves.filter((l) => {
    if (activeTab === 'ALL') return true;
    return l.status === activeTab;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="status-tag status-approved"><CheckCircle2 size={12} /> Approved</span>;
      case 'Pending':
        return <span className="status-tag status-pending"><Clock size={12} /> Pending Review</span>;
      case 'Rejected':
        return <span className="status-tag status-rejected"><XCircle size={12} /> Rejected</span>;
      case 'Cancelled':
        return <span className="status-tag status-cancelled">Cancelled</span>;
      default:
        return <span className="status-tag">{status}</span>;
    }
  };

  return (
    <div className="leaves-view-container">
      {/* Header */}
      <div className="view-header-bar">
        <div>
          <div className="view-title-row">
            <h2 className="view-title">My Leave Requests</h2>
            <span className="phase-pill">Self-Service</span>
          </div>
          <p className="view-subtitle">Submit holiday, sick, or emergency leave requests</p>
        </div>
        <div className="view-header-actions">
          <button
            type="button"
            className="btn-request-leave"
            onClick={() => setModalOpen(true)}
          >
            <Plus size={16} />
            <span>Request Leave</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="leave-summary-cards-grid">
        <div className="leave-stat-card">
          <div className="stat-card-top">
            <span className="stat-card-title">Pending Requests</span>
            <div className="stat-icon-wrapper amber">
              <Clock size={18} />
            </div>
          </div>
          <div className="stat-card-val text-amber">{summary?.pendingCount || 0}</div>
          <div className="stat-card-sub">Awaiting management review</div>
        </div>

        <div className="leave-stat-card">
          <div className="stat-card-top">
            <span className="stat-card-title">Approved Leaves</span>
            <div className="stat-icon-wrapper emerald">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="stat-card-val text-emerald">{summary?.approvedCount || 0}</div>
          <div className="stat-card-sub">{summary?.totalApprovedDays || 0} total approved days</div>
        </div>

        <div className="leave-stat-card">
          <div className="stat-card-top">
            <span className="stat-card-title">Annual Leave Taken</span>
            <div className="stat-icon-wrapper blue">
              <Palmtree size={18} />
            </div>
          </div>
          <div className="stat-card-val text-blue">{summary?.approvedAnnualLeaveDays || 0} days</div>
          <div className="stat-card-sub">Recorded this year</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="salary-tabs-bar" style={{ marginTop: '20px' }}>
        <button
          type="button"
          className={`salary-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
          onClick={() => setActiveTab('ALL')}
        >
          All Requests ({leaves.length})
        </button>
        <button
          type="button"
          className={`salary-tab-btn ${activeTab === 'Pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('Pending')}
        >
          Pending ({summary?.pendingCount || 0})
        </button>
        <button
          type="button"
          className={`salary-tab-btn ${activeTab === 'Approved' ? 'active' : ''}`}
          onClick={() => setActiveTab('Approved')}
        >
          Approved ({summary?.approvedCount || 0})
        </button>
        <button
          type="button"
          className={`salary-tab-btn ${activeTab === 'Rejected' ? 'active' : ''}`}
          onClick={() => setActiveTab('Rejected')}
        >
          Rejected ({summary?.rejectedCount || 0})
        </button>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="attendance-error-box" style={{ marginTop: '16px' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
          <button type="button" onClick={fetchData} className="retry-btn">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {/* Content List */}
      {loading ? (
        <div className="id-card-skeleton-loader" style={{ marginTop: '20px' }}>
          <div className="skeleton-line" style={{ height: '100px', marginBottom: '12px' }}></div>
          <div className="skeleton-line" style={{ height: '100px', marginBottom: '12px' }}></div>
        </div>
      ) : filteredLeaves.length === 0 ? (
        <div className="empty-state-card" style={{ marginTop: '24px' }}>
          <Palmtree size={48} className="empty-icon" />
          <h3 className="empty-title">No leave requests found</h3>
          <p className="empty-desc">
            {activeTab === 'ALL'
              ? 'You have not submitted any leave requests yet.'
              : `You have no ${activeTab.toLowerCase()} leave requests.`}
          </p>
          <button
            type="button"
            className="btn-request-leave"
            style={{ margin: '16px auto 0' }}
            onClick={() => setModalOpen(true)}
          >
            <Plus size={16} /> Request Leave
          </button>
        </div>
      ) : (
        <div className="leaves-list-stack" style={{ marginTop: '16px' }}>
          {filteredLeaves.map((item) => (
            <div key={item._id} className="leave-card-row">
              <div className="leave-card-header">
                <div className="leave-type-badge-pill">
                  <span className="dot"></span>
                  <strong>{item.leaveType}</strong>
                </div>
                <div>{getStatusBadge(item.status)}</div>
              </div>

              <div className="leave-card-content">
                <div className="leave-dates-row">
                  <CalendarDays size={16} className="text-muted" />
                  <span className="dates-val">
                    {item.startDate} &rarr; {item.endDate}
                  </span>
                  <span className="duration-pill">{item.totalDays} day{item.totalDays > 1 ? 's' : ''}</span>
                </div>

                <div className="leave-reason-text">
                  &ldquo;{item.reason}&rdquo;
                </div>

                {/* Management Review Box */}
                {item.reviewedAt && (
                  <div className={`management-review-box ${item.status === 'Approved' ? 'bg-emerald-light' : 'bg-rose-light'}`}>
                    <div className="review-meta">
                      <UserCheck size={13} />
                      <strong>Reviewed by {item.reviewedByName || 'Management'}:</strong>
                      <span>{new Date(item.reviewedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                    </div>
                    {item.reviewRemarks ? (
                      <p className="review-remarks-text">{item.reviewRemarks}</p>
                    ) : (
                      <p className="review-remarks-text italic">No management remarks provided.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              {item.status === 'Pending' && (
                <div className="leave-card-footer">
                  <span className="text-muted-xs">Submitted on {new Date(item.createdAt).toLocaleDateString('en-GB')}</span>
                  <button
                    type="button"
                    className="btn-cancel-leave"
                    onClick={() => handleCancelLeave(item._id)}
                    disabled={cancellingId === item._id}
                  >
                    {cancellingId === item._id ? 'Cancelling…' : 'Cancel Request'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Submission Modal */}
      {modalOpen && (
        <div className="modal-backdrop-overlay" onClick={() => !submitting && setModalOpen(false)}>
          <div className="modal-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header">
              <div className="modal-header-text">
                <h3 className="modal-dialog-title">Submit Leave Request</h3>
                <p className="modal-dialog-subtitle">Select dates and category for management review</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitLeave} className="modal-dialog-form">
              {formError && (
                <div className="form-error-alert">
                  <AlertCircle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              {/* Category Select */}
              <div className="form-group">
                <label className="form-label">Leave Category</label>
                <select
                  className="form-select-control"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  disabled={submitting}
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Pickers */}
              <div className="form-row-2col">
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input
                    type="date"
                    className="form-input-control"
                    value={startDate}
                    min={today}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">End Date</label>
                  <input
                    type="date"
                    className="form-input-control"
                    value={endDate}
                    min={startDate || today}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
              </div>

              {/* Duration Auto-Calculation Banner */}
              <div className="calculated-days-banner">
                <span>Calculated Working Period:</span>
                <strong className={computedDays > 0 ? 'text-blue' : 'text-rose'}>
                  {computedDays > 0 ? `${computedDays} Calendar Day${computedDays > 1 ? 's' : ''}` : 'Invalid Range'}
                </strong>
              </div>

              {/* Reason */}
              <div className="form-group">
                <label className="form-label">Reason / Notes</label>
                <textarea
                  className="form-textarea-control"
                  rows={3}
                  placeholder="Explain the purpose of your leave request (e.g. holiday travel, doctor appointment)..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={submitting}
                  maxLength={1000}
                  required
                />
              </div>

              <div className="business-rule-note">
                <AlertCircle size={14} />
                <span>Submitted leave requests will be reviewed by admin. Submitting leave does not immediately alter published rota or payroll until formally approved.</span>
              </div>

              <div className="modal-dialog-actions">
                <button
                  type="button"
                  className="btn-cancel-modal"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit-modal"
                  disabled={submitting || computedDays <= 0}
                >
                  <Send size={15} />
                  <span>{submitting ? 'Submitting…' : 'Submit Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
