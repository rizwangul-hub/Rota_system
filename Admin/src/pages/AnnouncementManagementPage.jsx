import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import {
  Megaphone,
  Plus,
  Bell,
  AlertTriangle,
  Info,
  Calendar,
  Clock,
  Eye,
  CheckCircle2,
  Trash2,
  Archive,
  Search,
  RefreshCw,
  X,
  Users,
  Building2,
  AlertCircle
} from 'lucide-react';

export default function AnnouncementManagementPage() {
  const [announcements, setAnnouncements] = useState([]);
  const [shops, setShops] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [targetType, setTargetType] = useState('ALL');
  const [targetShops, setTargetShops] = useState([]);
  const [targetEmployees, setTargetEmployees] = useState([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  // Readership Modal State
  const [readershipModalOpen, setReadershipModalOpen] = useState(false);
  const [activeReadership, setActiveReadership] = useState(null);
  const [loadingReadership, setLoadingReadership] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [annRes, shopsRes, empsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/announcements`),
        axios.get(`${API_BASE_URL}/shops`),
        axios.get(`${API_BASE_URL}/employees`)
      ]);

      if (annRes.data?.success) setAnnouncements(annRes.data.announcements || []);
      if (shopsRes.data?.success) setShops(shopsRes.data.shops || []);
      if (empsRes.data?.success) setEmployees(empsRes.data.employees || []);
    } catch (err) {
      console.error('Error fetching admin announcements:', err);
      setError(err.response?.data?.message || 'Failed to retrieve company announcements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateAnnouncement = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!title.trim() || !message.trim()) {
      setCreateError('Title and message are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/admin/announcements`, {
        title: title.trim(),
        message: message.trim(),
        priority,
        targetType,
        targetShops,
        targetEmployees,
        expiresAt: expiresAt || null
      });

      if (res.data?.success) {
        setCreateModalOpen(false);
        setTitle('');
        setMessage('');
        setPriority('Normal');
        setTargetType('ALL');
        setTargetShops([]);
        setTargetEmployees([]);
        setExpiresAt('');
        fetchData();
      }
    } catch (err) {
      console.error('Error creating announcement:', err);
      setCreateError(err.response?.data?.message || 'Could not publish announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewReadership = async (id) => {
    setLoadingReadership(true);
    setReadershipModalOpen(true);
    setActiveReadership(null);
    try {
      const res = await axios.get(`${API_BASE_URL}/admin/announcements/${id}/readership`);
      if (res.data?.success) {
        setActiveReadership(res.data);
      }
    } catch (err) {
      console.error('Error fetching readership:', err);
      alert('Failed to load readership data.');
    } finally {
      setLoadingReadership(false);
    }
  };

  const handleArchive = async (id) => {
    if (!window.confirm('Archive this announcement? It will be removed from workers active feed.')) return;
    try {
      const res = await axios.post(`${API_BASE_URL}/admin/announcements/${id}/archive`);
      if (res.data?.success) fetchData();
    } catch (err) {
      alert('Could not archive announcement.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Permanently delete this announcement?')) return;
    try {
      const res = await axios.delete(`${API_BASE_URL}/admin/announcements/${id}`);
      if (res.data?.success) fetchData();
    } catch (err) {
      alert('Could not delete announcement.');
    }
  };

  const getPriorityPill = (p) => {
    switch (p) {
      case 'Urgent':
        return <span style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>Urgent</span>;
      case 'Important':
        return <span style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>Important</span>;
      default:
        return <span style={{ background: 'rgba(56,189,248,0.2)', color: '#38bdf8', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>Normal</span>;
    }
  };

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="page-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Megaphone size={24} color="#38bdf8" /> Company Announcement Hub
          </h1>
          <p className="page-subtitle">Publish targeted workforce broadcasts, safety notices, and track read receipts</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn-refresh" onClick={fetchData} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#0284c7', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
          >
            <Plus size={16} /> New Announcement
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Grid of Announcements */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading announcements...</div>
      ) : announcements.length === 0 ? (
        <div style={{ background: 'var(--bg-card, #1e293b)', padding: '40px', borderRadius: '16px', textAlign: 'center', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Megaphone size={48} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <h3>No announcements published yet</h3>
          <p>Create your first notice to broadcast to all employees or specific shops.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {announcements.map((a) => (
            <div
              key={a._id}
              style={{
                background: 'var(--bg-card, #1e293b)',
                border: a.priority === 'Urgent' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {getPriorityPill(a.priority)}
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Target: <strong>{a.targetType}</strong></span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {new Date(a.publishedAt).toLocaleDateString('en-GB')}
                  </span>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>{a.title}</h3>
                <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5', margin: 0, whiteSpace: 'pre-wrap' }}>
                  {a.message}
                </p>
              </div>

              {/* Readership Stats Row */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>Readership Acknowledgement</span>
                  <strong style={{ color: '#38bdf8' }}>{a.stats?.readPercentage || 0}% ({a.stats?.readCount || 0} / {a.stats?.totalRecipients || 0})</strong>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${a.stats?.readPercentage || 0}%`, height: '100%', background: '#38bdf8' }}></div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => handleViewReadership(a._id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: '#38bdf8', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  <Eye size={14} /> View Receipts
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {a.status !== 'Archived' && (
                    <button
                      type="button"
                      onClick={() => handleArchive(a._id)}
                      title="Archive Announcement"
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                    >
                      <Archive size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(a._id)}
                    title="Delete Announcement"
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Announcement Modal */}
      {createModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', maxWidth: '540px', width: '100%', padding: '24px', color: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Create Announcement</h3>
              <button type="button" onClick={() => setCreateModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {createError && (
                <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
                  {createError}
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Title</label>
                <input
                  type="text"
                  placeholder="e.g. Bank Holiday Opening Hours / New Health & Safety Policy"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                  >
                    <option value="Normal">Normal</option>
                    <option value="Important">Important</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Target Audience</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                  >
                    <option value="ALL">All Active Employees</option>
                    <option value="SHOPS">Specific Branch(es)</option>
                    <option value="EMPLOYEES">Specific Worker(s)</option>
                  </select>
                </div>
              </div>

              {/* Shop Checkboxes if Target is SHOPS */}
              {targetType === 'SHOPS' && (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', display: 'block', marginBottom: '8px' }}>Select Target Branches:</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {shops.map((s) => (
                      <label key={s._id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={targetShops.includes(s._id)}
                          onChange={(e) => {
                            if (e.target.checked) setTargetShops([...targetShops, s._id]);
                            else setTargetShops(targetShops.filter((id) => id !== s._id));
                          }}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Message Body</label>
                <textarea
                  rows={4}
                  placeholder="Detailed announcement content..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Optional Expiry Date</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={submitting}
                  style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '9px 16px', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {submitting ? 'Publishing…' : 'Publish Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Readership Modal */}
      {readershipModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', maxWidth: '600px', width: '100%', padding: '24px', color: '#fff', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Read Receipts & Acknowledgements</h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#38bdf8' }}>
                  {activeReadership?.title}
                </p>
              </div>
              <button type="button" onClick={() => setReadershipModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {loadingReadership ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>Loading readership records...</div>
            ) : !activeReadership ? (
              <div style={{ padding: '20px', color: '#ef4444' }}>Unable to load readership data.</div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', marginBottom: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Total Recipients:</span>
                    <div style={{ fontSize: '16px', fontWeight: 800 }}>{activeReadership.stats?.total}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Read:</span>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981' }}>{activeReadership.stats?.read}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Unread:</span>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#ef4444' }}>{activeReadership.stats?.unread}</div>
                  </div>
                </div>

                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Employee</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Shop</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Acknowledged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeReadership.readership?.map((r, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px' }}>
                            <div style={{ fontWeight: 600 }}>{r.name}</div>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>{r.employeeId}</div>
                          </td>
                          <td style={{ padding: '8px', color: '#cbd5e1' }}>{r.shopName}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            {r.isRead ? (
                              <span style={{ color: '#10b981', fontWeight: 700 }}>Read</span>
                            ) : (
                              <span style={{ color: '#ef4444' }}>Unread</span>
                            )}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>
                            {r.readAt ? new Date(r.readAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
