import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Building2,
  ChevronRight,
  Filter,
  PlusCircle,
  X,
  Send,
  RefreshCw,
  FileQuestion,
  History,
  ArrowLeft,
  Check
} from 'lucide-react';

const FILTERS = [
  { id: 'THIS_WEEK', label: 'This Week' },
  { id: 'LAST_WEEK', label: 'Last Week' },
  { id: 'THIS_MONTH', label: 'This Month' },
  { id: 'LAST_MONTH', label: 'Last Month' },
  { id: 'CUSTOM', label: 'Custom' }
];

const ISSUE_OPTIONS = [
  { value: 'INCORRECT_ARRIVAL_TIME', label: 'My arrival time is incorrect' },
  { value: 'INCORRECT_LEAVING_TIME', label: 'My leaving time is incorrect' },
  { value: 'MISSING_ATTENDANCE', label: 'My attendance record is missing' },
  { value: 'WRONG_SHOP', label: 'Wrong branch/shop assigned' },
  { value: 'WRONG_STATUS', label: 'Wrong status (marked absent or late incorrectly)' },
  { value: 'OTHER', label: 'Other attendance problem' }
];

export default function MyAttendance({ onBack }) {
  const [activeFilter, setActiveFilter] = useState('THIS_WEEK');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeView, setActiveView] = useState('history'); // 'history' | 'requests'

  // Data states
  const [attendanceData, setAttendanceData] = useState(null);
  const [requestsList, setRequestsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);

  // Correction form
  const [formDate, setFormDate] = useState('');
  const [formIssueType, setFormIssueType] = useState('INCORRECT_ARRIVAL_TIME');
  const [formTimeReached, setFormTimeReached] = useState('');
  const [formWorkerEndTime, setFormWorkerEndTime] = useState('');
  const [formExplanation, setFormExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchAttendance();
    fetchRequests();
  }, [activeFilter, customStart, customEnd]);

  const fetchAttendance = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { filter: activeFilter };
      if (activeFilter === 'CUSTOM' && customStart && customEnd) {
        params.startDate = customStart;
        params.endDate = customEnd;
      }
      const res = await api.get('/worker/attendance', { params });
      if (res.data?.success) {
        setAttendanceData(res.data);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load attendance history.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await api.get('/worker/attendance/corrections');
      if (res.data?.success) {
        setRequestsList(res.data.requests || []);
      }
    } catch (err) {
      console.warn('Could not load correction requests:', err.message);
    }
  };

  const handleOpenCorrection = (record = null) => {
    if (record) {
      setFormDate(record.dateString);
      setFormTimeReached(record.timeReached || '');
      setFormWorkerEndTime(record.workerEndTime || '');
      setSelectedRecord(null); // Close detail modal if open
    } else {
      setFormDate(new Date().toISOString().slice(0, 10));
      setFormTimeReached('');
      setFormWorkerEndTime('');
    }
    setFormIssueType('INCORRECT_ARRIVAL_TIME');
    setFormExplanation('');
    setFormError('');
    setFormSuccess('');
    setCorrectionModalOpen(true);
  };

  const handleSubmitCorrection = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    setFormSuccess('');

    try {
      const payload = {
        dateString: formDate,
        issueType: formIssueType,
        explanation: formExplanation,
        proposedChanges: {
          timeReached: formTimeReached || undefined,
          workerEndTime: formWorkerEndTime || undefined
        }
      };

      const res = await api.post('/worker/attendance/corrections', payload);
      if (res.data?.success) {
        setFormSuccess(res.data.message || 'Problem reported successfully.');
        fetchRequests();
        setTimeout(() => {
          setCorrectionModalOpen(false);
          setActiveView('requests');
        }, 1800);
      }
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to submit correction request.');
    } finally {
      setSubmitting(false);
    }
  };

  const summary = attendanceData?.summary || {};
  const records = attendanceData?.records || [];
  const filterRange = attendanceData?.filterRange || {};

  return (
    <div className="attendance-page-layout">
      {/* Top Bar */}
      <div className="module-top-bar">
        <button
          type="button"
          className="btn-back"
          onClick={onBack}
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="module-top-title">
          <h2>My Attendance</h2>
          <span className="module-top-sub">Verified shift history & corrections</span>
        </div>
        <button
          type="button"
          className="btn-report-problem"
          onClick={() => handleOpenCorrection()}
        >
          <PlusCircle size={15} /> Report Problem
        </button>
      </div>

      {/* View Switcher: History vs Correction Requests */}
      <div className="view-toggle-bar">
        <button
          type="button"
          className={`toggle-tab ${activeView === 'history' ? 'toggle-tab-active' : ''}`}
          onClick={() => setActiveView('history')}
        >
          <Clock size={15} /> Attendance History ({summary.totalRecords || records.length})
        </button>
        <button
          type="button"
          className={`toggle-tab ${activeView === 'requests' ? 'toggle-tab-active' : ''}`}
          onClick={() => setActiveView('requests')}
        >
          <History size={15} /> Correction Requests ({requestsList.length})
        </button>
      </div>

      {activeView === 'history' ? (
        <>
          {/* Summary Metric Cards */}
          <div className="att-summary-banner">
            <div className="att-stat-item">
              <span className="att-stat-val text-emerald">{summary.verifiedDays || 0}</span>
              <span className="att-stat-lbl">Verified Days</span>
            </div>
            <div className="att-stat-item">
              <span className="att-stat-val text-primary">{summary.verifiedHours || 0}h</span>
              <span className="att-stat-lbl">Verified Hours</span>
            </div>
            <div className="att-stat-item">
              <span className="att-stat-val text-amber">{summary.lateArrivals || 0}</span>
              <span className="att-stat-lbl">Late Arrivals</span>
            </div>
            <div className="att-stat-item">
              <span className="att-stat-val text-purple">{summary.totalLateMinutes || 0}m</span>
              <span className="att-stat-lbl">Late Minutes</span>
            </div>
          </div>

          {/* Secondary stats row */}
          <div className="att-breakdown-pills">
            <span className="breakdown-pill">Present: <strong>{summary.presentDays || 0}</strong></span>
            <span className="breakdown-pill">Half Days: <strong>{summary.halfDays || 0}</strong></span>
            <span className="breakdown-pill">Absences: <strong>{summary.absentDays || 0}</strong></span>
            <span className="breakdown-pill caption-date">{filterRange.label || ''}</span>
          </div>

          {/* Date Filter Pills */}
          <div className="filter-pills-scroll">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`filter-pill ${activeFilter === f.id ? 'filter-pill-active' : ''}`}
                onClick={() => setActiveFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs if Custom selected */}
          {activeFilter === 'CUSTOM' && (
            <div className="custom-date-box">
              <div className="custom-input-wrap">
                <label>From:</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="custom-input-wrap">
                <label>To:</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="alert alert-error" style={{ margin: '12px 0' }}>
              <AlertCircle size={16} /> <div>{error}</div>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && !attendanceData && (
            <div className="att-loading-list">
              <div className="att-skeleton-card" />
              <div className="att-skeleton-card" />
              <div className="att-skeleton-card" />
            </div>
          )}

          {/* Attendance Records List */}
          <div className="att-records-list">
            {!loading && records.length === 0 ? (
              <div className="empty-att-state">
                <Calendar size={32} className="empty-icon" />
                <div className="empty-title">No Verified Attendance</div>
                <div className="empty-sub">
                  No checked attendance records found for this period.
                </div>
              </div>
            ) : (
              records.map((rec) => (
                <div
                  key={rec.id}
                  className="att-card"
                  onClick={() => setSelectedRecord(rec)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="att-card-top">
                    <div>
                      <div className="att-date-title">{rec.formattedDate}</div>
                      <div className="att-day-name">{rec.dayOfWeek}</div>
                    </div>

                    <div className="att-badge-group">
                      <span className={`status-tag status-${rec.status.toLowerCase()}`}>
                        {rec.status}
                      </span>
                      {rec.lateMinutes > 0 && (
                        <span className="late-tag">+{rec.lateMinutes}m</span>
                      )}
                    </div>
                  </div>

                  <div className="att-card-mid">
                    <div className="att-shop-info">
                      <Building2 size={13} style={{ display: 'inline', marginRight: '4px' }} />
                      <span>{rec.shopName}</span>
                    </div>
                    <div className="att-hours-info">
                      <span className="att-bold-hours">{rec.actualHours} hrs</span>
                      <span className="att-sched-hours">/ {rec.scheduledHours} scheduled</span>
                    </div>
                  </div>

                  <div className="att-card-bottom">
                    <div className="att-time-stamps">
                      <Clock size={12} style={{ display: 'inline', marginRight: '3px' }} />
                      <span>In: <strong>{rec.timeReached || '--:--'}</strong></span>
                      <span style={{ margin: '0 6px', opacity: 0.5 }}>|</span>
                      <span>Out: <strong>{rec.workerEndTime || '--:--'}</strong></span>
                    </div>

                    <div className="att-card-chevron">
                      <span className="att-view-label">Details</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        /* Correction Requests List */
        <div className="requests-container">
          <div className="requests-header-action">
            <p className="requests-subtitle">
              Submitted attendance problem reports and review statuses by management.
            </p>
            <button
              type="button"
              className="btn-primary"
              style={{ width: 'auto', padding: '8px 14px', fontSize: '13px' }}
              onClick={() => handleOpenCorrection()}
            >
              <PlusCircle size={15} /> New Request
            </button>
          </div>

          {requestsList.length === 0 ? (
            <div className="empty-att-state">
              <FileQuestion size={32} className="empty-icon" />
              <div className="empty-title">No Problem Reports</div>
              <div className="empty-sub">
                You haven't submitted any attendance correction requests.
              </div>
            </div>
          ) : (
            <div className="requests-list">
              {requestsList.map((req) => (
                <div key={req.id} className="request-card">
                  <div className="req-card-top">
                    <div>
                      <span className="req-date-badge">{req.dateString}</span>
                      <span className="req-shop-name">{req.shopName}</span>
                    </div>

                    <span className={`req-status-pill req-${req.status.toLowerCase()}`}>
                      {req.status === 'PENDING' && 'Pending Review'}
                      {req.status === 'APPROVED' && 'Approved'}
                      {req.status === 'REJECTED' && 'Rejected'}
                    </span>
                  </div>

                  <div className="req-issue-title">{req.issueLabel}</div>
                  <div className="req-explanation">{req.explanation}</div>

                  {req.proposedChanges?.timeReached || req.proposedChanges?.workerEndTime ? (
                    <div className="req-changes-box">
                      <strong>Requested:</strong>{' '}
                      {req.proposedChanges.timeReached && `Arrival: ${req.proposedChanges.timeReached} `}
                      {req.proposedChanges.workerEndTime && `Leaving: ${req.proposedChanges.workerEndTime}`}
                    </div>
                  ) : null}

                  {req.workerResponse && (
                    <div className={`req-response-box ${req.status === 'APPROVED' ? 'res-approved' : 'res-rejected'}`}>
                      <strong>Manager Response:</strong> {req.workerResponse}
                      {req.reviewedByName && (
                        <span className="reviewer-tag"> — {req.reviewedByName}</span>
                      )}
                    </div>
                  )}

                  <div className="req-card-footer">
                    Submitted: {new Date(req.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attendance Detail Modal */}
      {selectedRecord && (
        <div className="modal-overlay" onClick={() => setSelectedRecord(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-badge-row">
                <span className="modal-phase-badge">Shift Details</span>
                <span className={`status-tag status-${selectedRecord.status.toLowerCase()}`}>
                  {selectedRecord.status}
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedRecord(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="att-modal-body">
              <h3 className="att-modal-title">{selectedRecord.formattedDate}</h3>
              <div className="att-modal-shop">
                <Building2 size={15} /> {selectedRecord.shopName}
              </div>

              <div className="detail-stat-grid">
                <div className="detail-stat-card">
                  <div className="detail-lbl">Scheduled Shift</div>
                  <div className="detail-val">{selectedRecord.shiftStart} – {selectedRecord.shiftEnd}</div>
                  <div className="detail-sub">{selectedRecord.scheduledHours} hrs scheduled</div>
                </div>

                <div className="detail-stat-card">
                  <div className="detail-lbl">Actual Recorded</div>
                  <div className="detail-val">{selectedRecord.timeReached || '--'} – {selectedRecord.workerEndTime || '--'}</div>
                  <div className="detail-sub">{selectedRecord.actualHours} hrs worked</div>
                </div>
              </div>

              {selectedRecord.lateMinutes > 0 && (
                <div className="late-warning-banner">
                  <AlertTriangle size={16} color="#f59e0b" />
                  <span>Recorded Lateness: <strong>{selectedRecord.lateMinutes} minutes</strong></span>
                </div>
              )}

              {selectedRecord.remarks && (
                <div className="remarks-box">
                  <div className="remarks-lbl">Supervisor Remarks:</div>
                  <div className="remarks-text">{selectedRecord.remarks}</div>
                </div>
              )}

              <div className="verified-stamp">
                <CheckCircle2 size={16} color="#10b981" />
                <span>Verified by <strong>{selectedRecord.checkedByName || 'Supervisor'}</strong> on {selectedRecord.checkedAt ? new Date(selectedRecord.checkedAt).toLocaleDateString() : 'system check'}</span>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-outline"
                style={{ flex: 1 }}
                onClick={() => setSelectedRecord(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 1.4, fontSize: '13px' }}
                onClick={() => handleOpenCorrection(selectedRecord)}
              >
                <PlusCircle size={15} /> Report Problem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Problem / Correction Request Modal */}
      {correctionModalOpen && (
        <div className="modal-overlay" onClick={() => setCorrectionModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ fontSize: '18px', margin: 0 }}>
                Report Attendance Problem
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setCorrectionModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {formSuccess ? (
              <div className="alert alert-success" style={{ margin: '14px 0' }}>
                <Check size={18} />
                <div>{formSuccess}</div>
              </div>
            ) : (
              <form onSubmit={handleSubmitCorrection}>
                {formError && (
                  <div className="alert alert-error" style={{ marginBottom: '14px' }}>
                    <AlertCircle size={18} />
                    <div>{formError}</div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Shift Date *</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    style={{ paddingLeft: '14px' }}
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">What is the problem? *</label>
                  <select
                    className="form-input"
                    style={{ paddingLeft: '14px' }}
                    value={formIssueType}
                    onChange={(e) => setFormIssueType(e.target.value)}
                  >
                    {ISSUE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {formIssueType.includes('ARRIVAL') && (
                  <div className="form-group">
                    <label className="form-label">Correct Arrival Time</label>
                    <input
                      type="time"
                      className="form-input"
                      style={{ paddingLeft: '14px' }}
                      value={formTimeReached}
                      onChange={(e) => setFormTimeReached(e.target.value)}
                    />
                  </div>
                )}

                {formIssueType.includes('LEAVING') && (
                  <div className="form-group">
                    <label className="form-label">Correct Leaving Time</label>
                    <input
                      type="time"
                      className="form-input"
                      style={{ paddingLeft: '14px' }}
                      value={formWorkerEndTime}
                      onChange={(e) => setFormWorkerEndTime(e.target.value)}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Explanation & Details *</label>
                  <textarea
                    required
                    rows={3}
                    className="form-input"
                    style={{ padding: '10px 14px', resize: 'vertical' }}
                    placeholder="Describe what happened (e.g. reached shop at 09:15, operator recorded 09:45)..."
                    value={formExplanation}
                    onChange={(e) => setFormExplanation(e.target.value)}
                  />
                </div>

                <div className="modal-footer" style={{ padding: 0, marginTop: '16px', display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ flex: 1 }}
                    onClick={() => setCorrectionModalOpen(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ flex: 1.5 }}
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
