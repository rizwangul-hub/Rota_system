import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Building2,
  MapPin,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Info,
  Coffee,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  Check,
  CalendarDays,
  X,
  FileText
} from 'lucide-react';

const SHOP_BADGE_COLORS = {
  station: { bg: 'rgba(2, 132, 199, 0.15)', text: '#38bdf8', border: 'rgba(2, 132, 199, 0.4)' },
  camden: { bg: 'rgba(20, 184, 166, 0.15)', text: '#2dd4bf', border: 'rgba(20, 184, 166, 0.4)' },
  chelsea: { bg: 'rgba(99, 102, 241, 0.15)', text: '#a5b4fc', border: 'rgba(99, 102, 241, 0.4)' },
  edgware: { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.4)' },
  southwark: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' },
  leebridge: { bg: 'rgba(244, 63, 94, 0.15)', text: '#fb7185', border: 'rgba(244, 63, 94, 0.4)' }
};

function getShopBadgeStyle(shopName = '') {
  const s = String(shopName).toLowerCase();
  for (const [key, val] of Object.entries(SHOP_BADGE_COLORS)) {
    if (s.includes(key) || (key === 'leebridge' && (s.includes('lea') || s.includes('labridge')))) {
      return val;
    }
  }
  return { bg: 'rgba(148, 163, 184, 0.12)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.3)' };
}

function formatTime12(timeStr) {
  if (!timeStr) return '--:--';
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export default function MyRota({ onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentWeekStart, setCurrentWeekStart] = useState('');
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [selectedShopModal, setSelectedShopModal] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [ackSuccessMsg, setAckSuccessMsg] = useState('');

  const todayIso = new Date().toISOString().slice(0, 10);

  const fetchRota = async (weekStartParam) => {
    setLoading(true);
    setError('');
    setAckSuccessMsg('');
    try {
      const params = {};
      if (weekStartParam) params.weekStart = weekStartParam;
      const res = await api.get('/worker/rota', { params });
      if (res.data?.success) {
        setData(res.data);
        setCurrentWeekStart(res.data.weekStart);
      }
    } catch (err) {
      console.error('Failed to load weekly rota:', err);
      setError(err.response?.data?.message || 'Failed to load weekly rota schedule.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRota();
  }, []);

  const handleNavigateWeek = (targetWeekStart) => {
    fetchRota(targetWeekStart);
  };

  const handleAcknowledge = async () => {
    if (!data?.rotaId && !data?.weekStart) return;
    setAcknowledging(true);
    setAckSuccessMsg('');
    try {
      const res = await api.post('/worker/rota/acknowledge', {
        rotaId: data.rotaId,
        weekStart: data.weekStart
      });
      if (res.data?.success) {
        setAckSuccessMsg(res.data.message || 'Weekly rota acknowledged successfully!');
        // Update local state
        setData(prev => ({
          ...prev,
          acknowledgement: {
            ...prev.acknowledgement,
            status: 'ACKNOWLEDGED',
            isAcknowledged: true,
            hasChanged: false,
            acknowledgedAt: res.data.acknowledgement?.acknowledgedAt || new Date().toISOString()
          }
        }));
        setTimeout(() => setAckSuccessMsg(''), 4000);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to acknowledge rota. Please try again.');
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <div className="rota-page-container">
      {/* Page Header */}
      <div className="rota-header-card">
        <div className="rota-header-top">
          <button className="rota-back-btn" onClick={onBack} title="Back to Home">
            <ArrowLeft size={18} />
            <span>Dashboard</span>
          </button>
          <div className="rota-header-badge">
            <Sparkles size={14} color="#38bdf8" />
            <span>Published Weekly Rota</span>
          </div>
        </div>

        <div className="rota-header-title-row">
          <div>
            <h1 className="rota-title">My Weekly Schedule</h1>
            <p className="rota-subtitle">
              {data ? data.weekLabel : 'Loading rota...'}
            </p>
          </div>

          <button
            className="rota-select-week-btn"
            onClick={() => setWeekPickerOpen(true)}
            title="Browse available published weeks"
          >
            <CalendarDays size={16} />
            <span>Select Week</span>
          </button>
        </div>

        {/* Week Navigator */}
        <div className="rota-week-navigator">
          <button
            className="week-nav-btn"
            onClick={() => data?.prevWeekStart && handleNavigateWeek(data.prevWeekStart)}
            disabled={loading || !data?.prevWeekStart}
            title="Previous Week"
          >
            <ChevronLeft size={18} />
            <span>Prev</span>
          </button>

          <div className="week-nav-current-pill">
            <Calendar size={14} color="#38bdf8" />
            <span className="week-range-text">
              {data ? `${data.weekStart} to ${data.weekEnd}` : '...'}
            </span>
            {data?.isCurrentWeek && <span className="today-chip">Current Week</span>}
          </div>

          <button
            className="week-nav-btn"
            onClick={() => data?.nextWeekStart && handleNavigateWeek(data.nextWeekStart)}
            disabled={loading || !data?.nextWeekStart}
            title="Next Week"
          >
            <span>Next</span>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Week Selector Modal */}
      {weekPickerOpen && (
        <div className="modal-backdrop" onClick={() => setWeekPickerOpen(false)}>
          <div className="rota-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CalendarDays size={18} color="#38bdf8" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Select Published Week
                </h3>
              </div>
              <button className="modal-close-btn" onClick={() => setWeekPickerOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="rota-picker-list">
              {data?.availableWeeks && data.availableWeeks.length > 0 ? (
                data.availableWeeks.map(wk => (
                  <button
                    key={wk.weekStart}
                    className={`rota-picker-item ${wk.weekStart === currentWeekStart ? 'active' : ''}`}
                    onClick={() => {
                      setWeekPickerOpen(false);
                      handleNavigateWeek(wk.weekStart);
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                      <span className="picker-item-label">{wk.label}</span>
                      <span className="picker-item-dates">{wk.weekStart} — {wk.weekEnd}</span>
                    </div>
                    {wk.isCurrent && <span className="picker-current-tag">This Week</span>}
                  </button>
                ))
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No other published weeks found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rota-error-card">
          <AlertTriangle size={20} color="#ef4444" />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#f87171' }}>{error}</p>
          </div>
          <button className="btn-retry" onClick={() => fetchRota(currentWeekStart)}>
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      )}

      {/* Success Banner */}
      {ackSuccessMsg && (
        <div className="rota-ack-success-banner">
          <CheckCircle2 size={18} color="#10b981" />
          <span>{ackSuccessMsg}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="rota-loading-container">
          <div className="skeleton-summary-grid">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="skeleton-stat-card" />
            ))}
          </div>
          <div className="skeleton-days-list">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="skeleton-day-card" />
            ))}
          </div>
        </div>
      ) : data ? (
        <>
          {/* Summary Metrics Bar */}
          <div className="rota-summary-grid">
            <div className="rota-summary-card">
              <span className="rota-summary-lbl">Scheduled Shifts</span>
              <span className="rota-summary-val">{data.summary.totalShifts}</span>
              <span className="rota-summary-sub">shifts assigned</span>
            </div>

            <div className="rota-summary-card">
              <span className="rota-summary-lbl">Total Hours</span>
              <span className="rota-summary-val" style={{ color: '#38bdf8' }}>
                {data.summary.totalHours}h
              </span>
              <span className="rota-summary-sub">scheduled time</span>
            </div>

            <div className="rota-summary-card">
              <span className="rota-summary-lbl">Working Days</span>
              <span className="rota-summary-val" style={{ color: '#10b981' }}>
                {data.summary.workingDays}
              </span>
              <span className="rota-summary-sub">days on duty</span>
            </div>

            <div className="rota-summary-card">
              <span className="rota-summary-lbl">Days Off</span>
              <span className="rota-summary-val" style={{ color: '#a855f7' }}>
                {data.summary.daysOff}
              </span>
              <span className="rota-summary-sub">rest days</span>
            </div>

            <div className="rota-summary-card">
              <span className="rota-summary-lbl">Branches</span>
              <span className="rota-summary-val" style={{ color: '#f59e0b' }}>
                {data.summary.shopsCount}
              </span>
              <span className="rota-summary-sub">
                {data.summary.shopsCount > 1 ? 'Multi-branch' : 'Branch'}
              </span>
            </div>
          </div>

          {/* Acknowledgement & Change Notification Card */}
          {data.published ? (
            <div className={`rota-ack-card ${data.acknowledgement.hasChanged ? 'update-required' : data.acknowledgement.isAcknowledged ? 'acknowledged' : 'pending'}`}>
              <div className="ack-card-left">
                {data.acknowledgement.hasChanged ? (
                  <div className="ack-icon-box update">
                    <AlertTriangle size={22} color="#f59e0b" />
                  </div>
                ) : data.acknowledgement.isAcknowledged ? (
                  <div className="ack-icon-box success">
                    <CheckCircle2 size={22} color="#10b981" />
                  </div>
                ) : (
                  <div className="ack-icon-box pending">
                    <FileText size={22} color="#38bdf8" />
                  </div>
                )}

                <div className="ack-text-box">
                  {data.acknowledgement.hasChanged ? (
                    <>
                      <h4 className="ack-title" style={{ color: '#fbbf24' }}>
                        Schedule Updated by Management!
                      </h4>
                      <p className="ack-desc">
                        Your shifts were revised on{' '}
                        {data.acknowledgement.lastPublishedAt
                          ? new Date(data.acknowledgement.lastPublishedAt).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'recently'}
                        . Please review the updated schedule and re-confirm.
                      </p>
                    </>
                  ) : data.acknowledgement.isAcknowledged ? (
                    <>
                      <h4 className="ack-title" style={{ color: '#34d399' }}>
                        Schedule Confirmed & Acknowledged
                      </h4>
                      <p className="ack-desc">
                        You confirmed this weekly rota on{' '}
                        {new Date(data.acknowledgement.acknowledgedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                        .
                      </p>
                    </>
                  ) : (
                    <>
                      <h4 className="ack-title" style={{ color: '#38bdf8' }}>
                        Please Acknowledge Your Rota
                      </h4>
                      <p className="ack-desc">
                        Confirm you have seen and reviewed your shift assignments for this week.
                      </p>
                    </>
                  )}
                </div>
              </div>

              {!data.acknowledgement.isAcknowledged && (
                <button
                  className={`btn-ack-rota ${data.acknowledgement.hasChanged ? 'btn-ack-update' : ''}`}
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                >
                  <Check size={16} />
                  <span>
                    {acknowledging
                      ? 'Confirming...'
                      : data.acknowledgement.hasChanged
                      ? 'Re-Confirm Schedule'
                      : 'Confirm & Acknowledge'}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <div className="rota-unpublished-banner">
              <Info size={20} color="#94a3b8" />
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Rota Not Published Yet
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Management is finalizing this week's schedule. Please check back once published.
                </p>
              </div>
            </div>
          )}

          {/* 7-Day Schedule List */}
          <div className="rota-days-container">
            <div className="rota-section-header">
              <h2 className="rota-section-title">7-Day Work Schedule</h2>
              <span className="rota-section-sub">Sunday to Saturday</span>
            </div>

            <div className="rota-days-list">
              {data.days.map((day) => {
                const isToday = day.dateKey === todayIso;
                const hasShifts = !day.isDayOff && day.shifts.length > 0;

                return (
                  <div
                    key={day.dateKey}
                    className={`rota-day-card ${isToday ? 'is-today' : ''} ${day.isDayOff ? 'is-day-off' : ''}`}
                  >
                    {/* Day Date Header */}
                    <div className="day-card-header">
                      <div className="day-date-group">
                        <span className="day-name">{day.dayOfWeek}</span>
                        <span className="day-formatted-date">{day.formattedDate}</span>
                      </div>

                      <div className="day-badges-group">
                        {isToday && <span className="today-pill">TODAY</span>}
                        {day.isDayOff ? (
                          <span className="day-off-pill">
                            <Coffee size={12} /> Day Off
                          </span>
                        ) : (
                          <span className="hours-pill">
                            <Clock size={12} />
                            {day.shifts.reduce((acc, s) => acc + s.scheduledHours, 0)}h
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Shifts or Day-Off Content */}
                    {hasShifts ? (
                      <div className="day-shifts-container">
                        {day.shifts.map((shift, idx) => {
                          const badgeStyle = getShopBadgeStyle(shift.shopName);
                          return (
                            <div key={shift.id || idx} className="shift-item-box">
                              <div className="shift-main-row">
                                <div className="shift-time-group">
                                  <Clock size={16} color="#38bdf8" />
                                  <div className="shift-time-text">
                                    <span className="shift-time-range">
                                      {formatTime12(shift.startTime)} – {formatTime12(shift.endTime)}
                                    </span>
                                    <span className="shift-duration-tag">
                                      {shift.scheduledHours} hrs
                                    </span>
                                  </div>
                                </div>

                                <button
                                  className="shift-shop-badge"
                                  style={{
                                    backgroundColor: badgeStyle.bg,
                                    color: badgeStyle.text,
                                    borderColor: badgeStyle.border
                                  }}
                                  onClick={() => setSelectedShopModal(shift)}
                                  title="View shop address and branch info"
                                >
                                  <Building2 size={13} />
                                  <span>{shift.shopName}</span>
                                </button>
                              </div>

                              {shift.shopAddress && (
                                <div className="shift-address-row">
                                  <MapPin size={12} color="#64748b" />
                                  <span>{shift.shopAddress}</span>
                                </div>
                              )}

                              {shift.note && (
                                <div className="shift-note-box">
                                  <Info size={12} color="#f59e0b" />
                                  <span>{shift.note}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="day-off-content">
                        <div className="day-off-inner">
                          <Coffee size={24} color="#a855f7" />
                          <div className="day-off-text">
                            <span className="day-off-title">No Shift Scheduled</span>
                            <span className="day-off-sub">Enjoy your rest day!</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {/* Shop Details Modal */}
      {selectedShopModal && (
        <div className="modal-backdrop" onClick={() => setSelectedShopModal(null)}>
          <div className="rota-shop-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={20} color="#38bdf8" />
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {selectedShopModal.shopName}
                </h3>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedShopModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="shop-info-row">
                <span className="shop-info-lbl">Shift Hours:</span>
                <span className="shop-info-val">
                  {formatTime12(selectedShopModal.startTime)} – {formatTime12(selectedShopModal.endTime)} ({selectedShopModal.scheduledHours} hrs)
                </span>
              </div>

              {selectedShopModal.shopAddress ? (
                <div className="shop-info-row">
                  <span className="shop-info-lbl">Branch Address:</span>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <MapPin size={15} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span className="shop-info-val">{selectedShopModal.shopAddress}</span>
                  </div>
                </div>
              ) : null}

              {selectedShopModal.shopPhone ? (
                <div className="shop-info-row">
                  <span className="shop-info-lbl">Branch Phone:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={14} color="#10b981" />
                    <a href={`tel:${selectedShopModal.shopPhone}`} className="shop-phone-link">
                      {selectedShopModal.shopPhone}
                    </a>
                  </div>
                </div>
              ) : null}

              {selectedShopModal.note && (
                <div className="shop-info-row">
                  <span className="shop-info-lbl">Shift Instructions:</span>
                  <p className="shop-info-val" style={{ margin: 0, fontStyle: 'italic', color: '#f59e0b' }}>
                    "{selectedShopModal.note}"
                  </p>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '12px 16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-close-modal" onClick={() => setSelectedShopModal(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
