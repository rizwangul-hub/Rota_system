import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Megaphone,
  AlertTriangle,
  Info,
  Bell,
  CheckCircle2,
  Clock,
  Eye,
  Calendar,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Paperclip
} from 'lucide-react';

export default function MyAnnouncements({ onNoticeRead }) {
  const [announcements, setAnnouncements] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE' | 'HISTORY'
  const [expandedId, setExpandedId] = useState(null);
  const [markingId, setMarkingId] = useState(null);

  const fetchAnnouncements = async () => {
    setLoading(true);
    setError('');
    try {
      const [activeRes, historyRes] = await Promise.all([
        api.get('/worker/announcements'),
        api.get('/worker/announcements/history')
      ]);

      if (activeRes.data?.success) setAnnouncements(activeRes.data.announcements || []);
      if (historyRes.data?.success) setHistory(historyRes.data.announcements || []);
    } catch (err) {
      console.error('Failed to load announcements:', err);
      setError(err.response?.data?.message || 'Unable to retrieve company announcements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    setMarkingId(id);
    try {
      const res = await api.post(`/worker/announcements/${id}/read`);
      if (res.data?.success) {
        setAnnouncements((prev) =>
          prev.map((a) => (a._id === id ? { ...a, isRead: true, readAt: res.data.readAt } : a))
        );
        onNoticeRead?.();
      }
    } catch (err) {
      console.error('Error marking as read:', err);
    } finally {
      setMarkingId(null);
    }
  };

  const handleToggleExpand = (id, isRead) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!isRead) {
        handleMarkAsRead(id);
      }
    }
  };

  const currentList = activeTab === 'ACTIVE' ? announcements : history;
  const unreadCount = announcements.filter((a) => !a.isRead).length;

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'Urgent':
        return (
          <span className="priority-pill priority-urgent">
            <AlertTriangle size={12} /> Urgent
          </span>
        );
      case 'Important':
        return (
          <span className="priority-pill priority-important">
            <Bell size={12} /> Important
          </span>
        );
      default:
        return (
          <span className="priority-pill priority-normal">
            <Info size={12} /> Notice
          </span>
        );
    }
  };

  return (
    <div className="announcements-view-container">
      {/* Header */}
      <div className="view-header-bar">
        <div>
          <div className="view-title-row">
            <h2 className="view-title">Company Announcements</h2>
            {unreadCount > 0 && (
              <span className="badge-unread-count">{unreadCount} Unread</span>
            )}
          </div>
          <p className="view-subtitle">Official workforce notices, policy updates, and branch alerts</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="salary-tabs-bar" style={{ marginTop: '16px' }}>
        <button
          type="button"
          className={`salary-tab-btn ${activeTab === 'ACTIVE' ? 'active' : ''}`}
          onClick={() => setActiveTab('ACTIVE')}
        >
          Active Notices ({announcements.length})
        </button>
        <button
          type="button"
          className={`salary-tab-btn ${activeTab === 'HISTORY' ? 'active' : ''}`}
          onClick={() => setActiveTab('HISTORY')}
        >
          Notice Archive ({history.length})
        </button>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="attendance-error-box" style={{ marginTop: '16px' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
          <button type="button" onClick={fetchAnnouncements} className="retry-btn">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="id-card-skeleton-loader" style={{ marginTop: '20px' }}>
          <div className="skeleton-line" style={{ height: '90px', marginBottom: '12px' }}></div>
          <div className="skeleton-line" style={{ height: '90px', marginBottom: '12px' }}></div>
        </div>
      ) : currentList.length === 0 ? (
        <div className="empty-state-card" style={{ marginTop: '24px' }}>
          <Megaphone size={48} className="empty-icon" />
          <h3 className="empty-title">No announcements</h3>
          <p className="empty-desc">
            {activeTab === 'ACTIVE'
              ? 'There are no active company notices targeted to you right now.'
              : 'Your notice history archive is empty.'}
          </p>
        </div>
      ) : (
        <div className="announcements-stack" style={{ marginTop: '16px' }}>
          {currentList.map((notice) => {
            const isExpanded = expandedId === notice._id;
            return (
              <div
                key={notice._id}
                className={`announcement-item-card ${!notice.isRead ? 'unread-glow' : ''} ${notice.priority === 'Urgent' ? 'border-urgent' : ''}`}
                onClick={() => handleToggleExpand(notice._id, notice.isRead)}
              >
                <div className="announcement-item-header">
                  <div className="item-header-meta">
                    {getPriorityBadge(notice.priority)}
                    <span className="notice-author-name">By {notice.publishedByName || 'Management'}</span>
                    <span className="notice-date-str">
                      <Clock size={11} style={{ display: 'inline', marginRight: '4px' }} />
                      {new Date(notice.publishedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                  </div>

                  <div className="item-header-status">
                    {!notice.isRead ? (
                      <span className="dot-unread" title="Unread Notice">● Unread</span>
                    ) : (
                      <span className="read-receipt-pill">
                        <CheckCircle2 size={12} color="#16a34a" /> Read
                      </span>
                    )}
                    <button type="button" className="btn-chevron-expand">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                <h3 className="announcement-card-title">{notice.title}</h3>

                <div className={`announcement-body-wrap ${isExpanded ? 'expanded' : 'collapsed'}`}>
                  <p className="announcement-body-text">{notice.message}</p>

                  {notice.attachment && (
                    <div className="attachment-box">
                      <Paperclip size={14} />
                      <a href={notice.attachment} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        View Attached Document
                      </a>
                    </div>
                  )}

                  <div className="announcement-card-footer">
                    {notice.readAt && (
                      <span className="read-timestamp-note">
                        Acknowledged on {new Date(notice.readAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    )}

                    {!notice.isRead && (
                      <button
                        type="button"
                        className="btn-mark-read"
                        onClick={(e) => handleMarkAsRead(notice._id, e)}
                        disabled={markingId === notice._id}
                      >
                        <CheckCircle2 size={14} />
                        <span>{markingId === notice._id ? 'Marking…' : 'Acknowledge as Read'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
