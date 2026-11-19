import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import {
  Palmtree,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  AlertTriangle,
  RefreshCw,
  Building2,
  User,
  X,
  Check,
  AlertCircle,
  UserCheck
} from 'lucide-react';

export default function LeaveManagementPage() {
  const [leaves, setLeaves] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [shopFilter, setShopFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Review Modal State
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [overlapData, setOverlapData] = useState([]);

  const fetchShops = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/shops`);
      if (res.data?.success) setShops(res.data.shops || []);
    } catch (err) {
      console.error('Failed to load shops:', err);
    }
  };

  const fetchLeaves = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (shopFilter !== 'ALL') params.shopId = shopFilter;

      const res = await axios.get(`${API_BASE_URL}/admin/leaves`, { params });
      if (res.data?.success) {
        setLeaves(res.data.leaves || []);
        if (res.data.stats) setStats(res.data.stats);
      }
    } catch (err) {
      console.error('Error fetching admin leaves:', err);
      setError(err.response?.data?.message || 'Failed to load employee leave requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShops();
  }, []);

  useEffect(() => {
    fetchLeaves();
  }, [statusFilter, shopFilter]);

  const handleOpenReview = async (leave) => {
    setSelectedLeave(leave);
    setReviewRemarks(leave.reviewRemarks || '');
    setReviewModalOpen(true);
    setOverlapData([]);

    // Fetch details & shop overlap warnings
    try {
      const res = await axios.get(`${API_BASE_URL}/admin/leaves/${leave._id}`);
      if (res.data?.success && res.data.shopOverlaps) {
        setOverlapData(res.data.shopOverlaps);
      }
    } catch (err) {
      console.error('Failed to load leave details:', err);
    }
  };

  const handleReviewAction = async (decision) => {
    if (!selectedLeave) return;
    setSubmittingReview(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/admin/leaves/${selectedLeave._id}/review`, {
        status: decision,
        reviewRemarks
      });

      if (res.data?.success) {
        setReviewModalOpen(false);
        setSelectedLeave(null);
        fetchLeaves();
      }
    } catch (err) {
      console.error('Failed to review leave:', err);
      alert(err.response?.data?.message || 'Error processing review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const filteredLeaves = leaves.filter((l) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const name = l.employee?.name?.toLowerCase() || '';
    const empId = l.employee?.employeeId?.toLowerCase() || '';
    const reason = l.reason?.toLowerCase() || '';
    return name.includes(term) || empId.includes(term) || reason.includes(term);
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="status-badge status-approved"><CheckCircle2 size={12} /> Approved</span>;
      case 'Pending':
        return <span className="status-badge status-pending"><Clock size={12} /> Pending</span>;
      case 'Rejected':
        return <span className="status-badge status-rejected"><XCircle size={12} /> Rejected</span>;
      case 'Cancelled':
        return <span className="status-badge status-cancelled">Cancelled</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  return (
    <div className="admin-page-container">
      {/* Top Header */}
      <div className="page-header-flex">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Palmtree size={24} color="#f59e0b" /> Employee Leave Management
          </h1>
          <p className="page-subtitle">Review, approve, and track workforce holiday and sick leave requests</p>
        </div>
        <button type="button" className="btn-refresh" onClick={fetchLeaves} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Metrics Banner */}
      <div className="metrics-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', margin: '20px 0' }}>
        <div className="metric-card" style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Pending Review</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>{stats.pending}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Awaiting decision</div>
        </div>

        <div className="metric-card" style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Approved Requests</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>{stats.approved}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Active / recorded</div>
        </div>

        <div className="metric-card" style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Rejected Requests</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#ef4444', marginTop: '4px' }}>{stats.rejected}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Declined by management</div>
        </div>

        <div className="metric-card" style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Total Submissions</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>{stats.total}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Historical workforce log</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="table-filter-bar" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div className="search-input-wrap" style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }} />
          <input
            type="text"
            placeholder="Search by worker name, employee ID, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: '10px', background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: '10px', background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
        >
          <option value="ALL">All Statuses</option>
          <option value="Pending">Pending Review</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <select
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: '10px', background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
        >
          <option value="ALL">All Branches</option>
          {shops.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Error alert */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '12px', borderRadius: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="table-responsive-wrapper" style={{ background: 'var(--bg-card, #1e293b)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
              <th style={{ padding: '14px 16px' }}>Worker</th>
              <th style={{ padding: '14px 16px' }}>Shop</th>
              <th style={{ padding: '14px 16px' }}>Leave Category</th>
              <th style={{ padding: '14px 16px' }}>Requested Dates</th>
              <th style={{ padding: '14px 16px' }}>Days</th>
              <th style={{ padding: '14px 16px' }}>Status</th>
              <th style={{ padding: '14px 16px' }}>Reason</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading leave requests...
                </td>
              </tr>
            ) : filteredLeaves.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No leave requests matching criteria.
                </td>
              </tr>
            ) : (
              filteredLeaves.map((l) => (
                <tr key={l._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 700, color: '#fff' }}>{l.employee?.name || 'Worker'}</div>
                    <div style={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'monospace' }}>{l.employee?.employeeId}</div>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>
                    {l.employee?.assignedShop?.name || 'Unassigned'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', padding: '3px 8px', borderRadius: '6px', fontWeight: 600, fontSize: '12px' }}>
                      {l.leaveType}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#f1f5f9' }}>
                    {l.startDate} &rarr; {l.endDate}
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 700 }}>
                    {l.totalDays} day{l.totalDays > 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {getStatusBadge(l.status)}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#94a3b8', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.reason}>
                    &ldquo;{l.reason}&rdquo;
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenReview(l)}
                      style={{
                        background: l.status === 'Pending' ? '#0284c7' : 'rgba(255,255,255,0.06)',
                        color: '#fff',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      {l.status === 'Pending' ? 'Review Request' : 'View Details'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Review Modal */}
      {reviewModalOpen && selectedLeave && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', maxWidth: '540px', width: '100%', padding: '24px', color: '#fff', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Review Leave Request</h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  {selectedLeave.employee?.name} ({selectedLeave.employee?.employeeId})
                </p>
              </div>
              <button type="button" onClick={() => setReviewModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Category</span>
                <div style={{ fontWeight: 700, color: '#f59e0b' }}>{selectedLeave.leaveType}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Duration</span>
                <div style={{ fontWeight: 700 }}>{selectedLeave.totalDays} Day(s)</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Start Date</span>
                <div style={{ fontWeight: 700 }}>{selectedLeave.startDate}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>End Date</span>
                <div style={{ fontWeight: 700 }}>{selectedLeave.endDate}</div>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Worker Explanation:</span>
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', fontStyle: 'italic', marginTop: '4px' }}>
                &ldquo;{selectedLeave.reason}&rdquo;
              </div>
            </div>

            {/* Overlap Understaffing Warning */}
            {overlapData.length > 0 && (
              <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid #f59e0b', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontWeight: 700, marginBottom: '4px' }}>
                  <AlertTriangle size={15} /> Staffing Notice: Overlapping Leaves at this Branch
                </div>
                <div>
                  {overlapData.map((o) => (
                    <div key={o._id} style={{ color: '#fcd34d', marginTop: '2px' }}>
                      • <strong>{o.employee?.name}</strong> has approved leave ({o.startDate} &rarr; {o.endDate})
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                Management Remarks (Visible to Worker)
              </label>
              <textarea
                rows={3}
                placeholder="Optional notes or feedback for the employee (e.g. Approved, coverage arranged with Dave)..."
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
                style={{ width: '100%', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '10px', padding: '10px', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                disabled={submittingReview}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleReviewAction('Rejected')}
                disabled={submittingReview}
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                Reject Request
              </button>
              <button
                type="button"
                onClick={() => handleReviewAction('Approved')}
                disabled={submittingReview}
                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                Approve Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
