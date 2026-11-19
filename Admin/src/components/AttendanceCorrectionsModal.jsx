import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import {
  X,
  Check,
  AlertCircle,
  Clock,
  Building2,
  User,
  CheckCircle2,
  XCircle,
  FileText,
  RefreshCw,
  Filter
} from 'lucide-react';

export default function AttendanceCorrectionsModal({ isOpen, onClose, onReviewComplete }) {
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ pendingCount: 0, approvedCount: 0, rejectedCount: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [actioningId, setActioningId] = useState(null);

  // Review action modal
  const [activeRequest, setActiveRequest] = useState(null);
  const [reviewAction, setReviewAction] = useState('APPROVE');
  const [workerResponse, setWorkerResponse] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchRequests();
    }
  }, [isOpen, statusFilter]);

  const fetchRequests = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE_URL}/attendance/corrections`, {
        params: { status: statusFilter },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success) {
        setRequests(res.data.requests || []);
        if (res.data.counts) setCounts(res.data.counts);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load correction requests.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAction = (req, action) => {
    setActiveRequest(req);
    setReviewAction(action);
    setWorkerResponse(
      action === 'APPROVE'
        ? 'Your attendance correction request was approved and updated.'
        : 'Your correction request was reviewed and declined.'
    );
    setReviewerNotes('');
    setError('');
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!activeRequest) return;
    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE_URL}/attendance/corrections/${activeRequest._id}/review`,
        {
          action: reviewAction,
          workerResponse,
          reviewerNotes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success) {
        setActiveRequest(null);
        fetchRequests();
        if (onReviewComplete) onReviewComplete();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '820px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc'
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Worker Attendance Problem Reports
            </h2>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>
              Review issues and time correction requests submitted by workers via Worker Portal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: '#ffffff'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`btn btn-sm ${statusFilter === 'PENDING' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setStatusFilter('PENDING')}
              style={{ fontSize: '12px', padding: '5px 12px' }}
            >
              Pending ({counts.pendingCount || 0})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${statusFilter === 'APPROVED' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setStatusFilter('APPROVED')}
              style={{ fontSize: '12px', padding: '5px 12px' }}
            >
              Approved ({counts.approvedCount || 0})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${statusFilter === 'REJECTED' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setStatusFilter('REJECTED')}
              style={{ fontSize: '12px', padding: '5px 12px' }}
            >
              Rejected ({counts.rejectedCount || 0})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setStatusFilter('ALL')}
              style={{ fontSize: '12px', padding: '5px 12px' }}
            >
              All
            </button>
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={fetchRequests}
            disabled={loading}
            style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
              <div>Loading correction requests...</div>
            </div>
          ) : requests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <CheckCircle2 size={32} style={{ color: '#10b981', margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 600, color: '#0f172a' }}>No {statusFilter.toLowerCase()} requests</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>All reported issues are currently up to date.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {requests.map((req) => (
                <div
                  key={req._id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px',
                    backgroundColor: req.status === 'PENDING' ? '#fff' : '#f8fafc'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>
                          {req.employeeName}
                        </span>
                        <span style={{ fontSize: '11px', background: '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          {req.employeeId}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          • {req.shopName || req.shop?.name || 'Unassigned'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        Date: <strong>{req.dateString}</strong> • Submitted: {new Date(req.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      backgroundColor: req.status === 'PENDING' ? '#fef3c7' : req.status === 'APPROVED' ? '#dcfce7' : '#fee2e2',
                      color: req.status === 'PENDING' ? '#b45309' : req.status === 'APPROVED' ? '#15803d' : '#b91c1c'
                    }}>
                      {req.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
                    Issue: {req.issueLabel}
                  </div>

                  <div style={{ fontSize: '13px', color: '#334155', backgroundColor: '#f1f5f9', padding: '10px 12px', borderRadius: '8px', marginBottom: '10px' }}>
                    {req.explanation}
                  </div>

                  {/* Comparison Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px', marginBottom: '12px' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 10px' }}>
                      <div style={{ color: '#64748b', fontWeight: 600 }}>Recorded Values:</div>
                      <div>Arrival: {req.originalValues?.timeReached || 'None'} | Leaving: {req.originalValues?.workerEndTime || 'None'}</div>
                      <div>Status: {req.originalValues?.status || 'Unknown'} | Hours: {req.originalValues?.actualHours || 0}h</div>
                    </div>

                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '8px 10px' }}>
                      <div style={{ color: '#166534', fontWeight: 600 }}>Worker Proposed:</div>
                      <div>Arrival: {req.proposedChanges?.timeReached || '—'} | Leaving: {req.proposedChanges?.workerEndTime || '—'}</div>
                    </div>
                  </div>

                  {/* If already reviewed */}
                  {req.status !== 'PENDING' && (
                    <div style={{ fontSize: '12px', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                      Reviewed by <strong>{req.reviewedByName}</strong> on {req.reviewedAt ? new Date(req.reviewedAt).toLocaleDateString() : ''}
                      {req.workerResponse && <div style={{ color: '#0f172a', marginTop: '2px' }}>Message to worker: "{req.workerResponse}"</div>}
                    </div>
                  )}

                  {/* Actions for PENDING */}
                  {req.status === 'PENDING' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                        onClick={() => handleOpenAction(req, 'REJECT')}
                      >
                        <XCircle size={14} style={{ marginRight: '4px' }} /> Reject
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                        onClick={() => handleOpenAction(req, 'APPROVE')}
                      >
                        <CheckCircle2 size={14} style={{ marginRight: '4px' }} /> Approve & Update
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Confirmation Modal */}
        {activeRequest && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            padding: '16px'
          }}>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '20px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px', color: reviewAction === 'APPROVE' ? '#166534' : '#b91c1c' }}>
                {reviewAction === 'APPROVE' ? 'Approve Correction Request' : 'Reject Correction Request'}
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px' }}>
                For {activeRequest.employeeName} ({activeRequest.dateString}).
              </p>

              {error && (
                <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '12px' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmitReview}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Response to Worker (Visible in portal)
                  </label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    style={{ fontSize: '13px' }}
                    value={workerResponse}
                    onChange={(e) => setWorkerResponse(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Internal Reviewer Notes (Audit log only)
                  </label>
                  <textarea
                    rows={2}
                    className="form-control"
                    style={{ fontSize: '12px', resize: 'vertical' }}
                    placeholder="Optional notes for managers..."
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setActiveRequest(null)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-sm btn-primary"
                    style={{ backgroundColor: reviewAction === 'APPROVE' ? '#16a34a' : '#dc2626', borderColor: 'transparent' }}
                    disabled={submitting}
                  >
                    {submitting ? 'Saving...' : reviewAction === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
