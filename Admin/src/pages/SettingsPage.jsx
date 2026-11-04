import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { Store, Clock, Shield, Plus, Save, Check, Rocket, AlertTriangle, RefreshCw } from 'lucide-react';
import { clearShopCache } from '../utils/shopCache';

export default function SettingsPage() {
  const [shops, setShops] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [gracePeriod, setGracePeriod] = useState(15);
  const [attendanceReminder, setAttendanceReminder] = useState({
    time: '14:00',
    message: "Please remember to record today's staff attendance."
  });
  const [loading, setLoading] = useState(true);
  const [newShopName, setNewShopName] = useState('');
  const [newShopAddress, setNewShopAddress] = useState('');
  const [newShopPhone, setNewShopPhone] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // System Update & Version Management States
  const [systemVersion, setSystemVersion] = useState({
    version: '2.5.0',
    buildId: '',
    type: 'normal',
    title: '🚀 System Update Available!',
    message: 'We have improved the system with new features, enhancements, and bug fixes.\n\nPlease refresh the system to experience the latest improvements.',
    releaseNotes: '',
    criticalDeadlineMinutes: 30
  });
  const [publishingUpdate, setPublishingUpdate] = useState(false);
  const [updatePublishSuccess, setUpdatePublishSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [shopsRes, schedRes, setRes, reminderRes, versionRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/shops?includeInactive=true`),
        axios.get(`${API_BASE_URL}/shops/schedules`),
        axios.get(`${API_BASE_URL}/settings`),
        axios.get(`${API_BASE_URL}/settings/attendance-reminder`),
        axios.get(`${API_BASE_URL}/version`).catch(() => ({ data: {} }))
      ]);

      if (shopsRes.data.success) setShops(shopsRes.data.shops);
      if (schedRes.data.success) setSchedules(schedRes.data.schedules);
      if (setRes.data.success && setRes.data.settings.GRACE_PERIOD_MINUTES !== undefined) {
        setGracePeriod(setRes.data.settings.GRACE_PERIOD_MINUTES);
      }
      if (reminderRes.data.success && reminderRes.data.reminder) {
        setAttendanceReminder(reminderRes.data.reminder);
      }
      if (versionRes.data.success) {
        setSystemVersion(current => ({
          ...current,
          version: versionRes.data.version || current.version,
          buildId: versionRes.data.buildId || '',
          type: versionRes.data.type || 'normal',
          title: versionRes.data.title || current.title,
          message: versionRes.data.message || current.message,
          releaseNotes: Array.isArray(versionRes.data.releaseNotes)
            ? versionRes.data.releaseNotes.join('\n')
            : ''
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShop = async (e) => {
    e.preventDefault();
    if (!newShopName.trim()) return;
    try {
      const res = await axios.post(`${API_BASE_URL}/shops`, {
        name: newShopName.trim(),
        address: newShopAddress,
        phone: newShopPhone
      });
      if (res.data.success) {
        clearShopCache();
        setNewShopName('');
        setNewShopAddress('');
        setNewShopPhone('');
        fetchSettings();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create shop');
    }
  };

  const handleToggleShopStatus = async (shop) => {
    const action = shop.status === 'Active' ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} the shop "${shop.name}"?`)) return;
    try {
      const res = await axios.patch(`${API_BASE_URL}/shops/${shop._id}/toggle-status`);
      if (res.data.success) {
        clearShopCache();
        fetchSettings();
      }
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} shop`);
    }
  };

  const handleUpdateSchedule = async (id, openTime, closeTime) => {
    if (!openTime || !closeTime) {
      alert('Both opening time and closing time are required.');
      return;
    }
    if (closeTime <= openTime) {
      alert(`Invalid shift times: Closing time (${closeTime}) must be strictly after opening time (${openTime}).`);
      return;
    }
    try {
      const res = await axios.put(`${API_BASE_URL}/shops/schedules/${id}`, {
        openingTime: openTime,
        closingTime: closeTime
      });
      if (res.data.success) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2500);
        fetchSettings();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update schedule');
    }
  };


  const handleSaveGracePeriod = async () => {
    try {
      await axios.post(`${API_BASE_URL}/settings`, {
        key: 'GRACE_PERIOD_MINUTES',
        value: Number(gracePeriod),
        description: 'Lateness tolerance threshold in minutes'
      });
      alert('Grace period setting saved successfully!');
    } catch (err) {
      alert('Failed to save grace period');
    }
  };

  const handleSaveAttendanceReminder = async () => {
    if (!attendanceReminder.time || !attendanceReminder.message.trim()) {
      alert('Choose a reminder time and enter a message.');
      return;
    }
    if (attendanceReminder.message.trim().length > 200) {
      alert('The reminder message must be 200 characters or fewer.');
      return;
    }

    try {
      const res = await axios.put(`${API_BASE_URL}/settings/attendance-reminder`, {
        time: attendanceReminder.time,
        message: attendanceReminder.message.trim()
      });
      if (res.data.success) {
        setAttendanceReminder(res.data.reminder);
        alert('Daily attendance reminder saved. The Usman app will sync the change when it is active or reopened.');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save attendance reminder.');
    }
  };

  const handlePublishUpdateAnnouncement = async (e) => {
    e.preventDefault();
    setPublishingUpdate(true);
    setUpdatePublishSuccess(false);

    try {
      const isCritical = systemVersion.type === 'critical';
      const deadline = isCritical && systemVersion.criticalDeadlineMinutes > 0
        ? new Date(Date.now() + systemVersion.criticalDeadlineMinutes * 60 * 1000).toISOString()
        : null;

      const releaseNotesList = systemVersion.releaseNotes
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);

      const res = await axios.put(`${API_BASE_URL}/version`, {
        version: systemVersion.version,
        type: systemVersion.type,
        title: systemVersion.title,
        message: systemVersion.message,
        releaseNotes: releaseNotesList,
        criticalDeadline: deadline,
        bumpBuild: true
      });

      if (res.data.success) {
        setUpdatePublishSuccess(true);
        if (res.data.config) {
          setSystemVersion(current => ({
            ...current,
            buildId: res.data.config.buildId
          }));
        }
        setTimeout(() => setUpdatePublishSuccess(false), 4500);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to publish system update announcement.');
    } finally {
      setPublishingUpdate(false);
    }
  };

  return (
    <div className="page-container">
      {/* Title */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
          System Configuration & Shop Schedules
        </h1>
        <p style={{ color: '#64748b', fontSize: '13px' }}>
          Centralized shop opening/closing hours, 15-minute lateness threshold, and locations
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Lateness Threshold Card */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Clock size={18} color="#2563eb" />
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
              15-Minute Lateness Rule Settings
            </h2>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
            UK Rule: Lateness up to 15 minutes is tolerated without financial penalty. Arrivals past 15 minutes deduct full lateness from shift start based on the employee's calculated hourly rate.
          </p>

          <div className="form-group">
            <label className="form-label">Grace Period (Minutes)</label>
            <input
              type="number"
              className="form-input"
              value={gracePeriod}
              onChange={(e) => setGracePeriod(e.target.value)}
            />
          </div>

          <button className="btn btn-primary btn-sm" onClick={handleSaveGracePeriod}>
            <Save size={14} /> Update Rule
          </button>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Clock size={18} color="#2563eb" />
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
              Usman Attendance Reminder
            </h2>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
            One daily notification at the selected time on the Usman attendance app. The default time is 2:00 PM (device local time).
          </p>
          <div className="form-group">
            <label className="form-label" htmlFor="attendance-reminder-time">Reminder Time</label>
            <input
              id="attendance-reminder-time"
              type="time"
              lang="en-GB"
              className="form-input"
              value={attendanceReminder.time}
              onChange={e => setAttendanceReminder(current => ({ ...current, time: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="attendance-reminder-message">Notification Message</label>
            <textarea
              id="attendance-reminder-message"
              className="form-input"
              value={attendanceReminder.message}
              onChange={e => setAttendanceReminder(current => ({ ...current, message: e.target.value }))}
              maxLength={200}
              rows={3}
              required
            />
            <small style={{ color: '#64748b' }}>{attendanceReminder.message.length}/200 characters</small>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSaveAttendanceReminder}>
            <Save size={14} /> Save Reminder
          </button>
        </div>

        {/* Add New Shop Card */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Store size={18} color="#2563eb" />
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
              Add Bicycle Shop Location
            </h2>
          </div>
          <form onSubmit={handleCreateShop}>
            <div className="form-group">
              <label className="form-label">Shop Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Islington, Richmond"
                value={newShopName}
                onChange={(e) => setNewShopName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input
                type="text"
                className="form-input"
                placeholder="UK address"
                value={newShopAddress}
                onChange={(e) => setNewShopAddress(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">
              <Plus size={14} /> Add Shop
            </button>
          </form>
        </div>

        {/* Smart System Version & Update Management Card */}
        <div className="card" style={{ border: '1.5px solid #3b82f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Rocket size={18} color="#2563eb" />
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                Smart System Update & Version
              </h2>
            </div>
            <span style={{ fontSize: '11px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
              v{systemVersion.version}
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px', lineHeight: 1.4 }}>
            Active users automatically receive notifications when a new version is deployed. You can also broadcast manual release announcements.
          </div>

          {updatePublishSuccess && (
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={14} color="#059669" />
              <span>Update broadcast published! Active users will be notified automatically.</span>
            </div>
          )}

          <form onSubmit={handlePublishUpdateAnnouncement}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Release Version</label>
                <input
                  type="text"
                  className="form-input"
                  value={systemVersion.version}
                  onChange={e => setSystemVersion(c => ({ ...c, version: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Update Severity</label>
                <select
                  className="form-input"
                  value={systemVersion.type}
                  onChange={e => setSystemVersion(c => ({ ...c, type: e.target.value }))}
                >
                  <option value="normal">Normal Update</option>
                  <option value="critical">Critical Update (Required)</option>
                </select>
              </div>
            </div>

            {systemVersion.type === 'critical' && (
              <div className="form-group" style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#991b1b', marginBottom: '6px' }}>
                  <AlertTriangle size={14} />
                  <span>Critical Enforcement Deadline</span>
                </div>
                <select
                  className="form-input"
                  value={systemVersion.criticalDeadlineMinutes}
                  onChange={e => setSystemVersion(c => ({ ...c, criticalDeadlineMinutes: Number(e.target.value) }))}
                >
                  <option value={15}>15 Minutes from now</option>
                  <option value={30}>30 Minutes from now</option>
                  <option value={60}>1 Hour from now</option>
                  <option value={120}>2 Hours from now</option>
                  <option value={0}>Immediate (No grace period)</option>
                </select>
                <small style={{ color: '#b91c1c', display: 'block', marginTop: '4px' }}>
                  After deadline passes, active users are prompted to reload to continue.
                </small>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Update Title</label>
              <input
                type="text"
                className="form-input"
                value={systemVersion.title}
                onChange={e => setSystemVersion(c => ({ ...c, title: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Release Notes (One item per line)</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Added new attendance feature&#10;Improved rota planning speed&#10;Fixed late calculation edge cases"
                value={systemVersion.releaseNotes}
                onChange={e => setSystemVersion(c => ({ ...c, releaseNotes: e.target.value }))}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={publishingUpdate}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: systemVersion.type === 'critical' ? '#dc2626' : '#2563eb',
                borderColor: systemVersion.type === 'critical' ? '#dc2626' : '#2563eb'
              }}
            >
              {publishingUpdate ? (
                <RefreshCw size={14} className="spin" />
              ) : (
                <Rocket size={14} />
              )}
              <span>{publishingUpdate ? 'Broadcasting...' : 'Broadcast Update Announcement'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Default Shift Hours by Day of Week */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
            Default Shop Shift Hours (UK Standard)
          </h2>
          {savedSuccess && (
            <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
              ✓ Shift hours updated!
            </span>
          )}
        </div>

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Day of Week</th>
                <th>Opening Time (Shift Start)</th>
                <th>Closing Time (Shift End)</th>
                <th>Default Working Hours</th>
                <th style={{ textAlign: 'right' }}>Save</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(sch => (
                <tr key={sch._id}>
                  <td style={{ fontWeight: 600 }}>{sch.dayName}</td>
                  <td>
                    <input
                      type="time"
                      lang="en-US"
                      className="form-input"
                      style={{ width: '130px' }}
                      defaultValue={sch.openingTime}
                      id={`open_${sch._id}`}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      lang="en-US"
                      className="form-input"
                      style={{ width: '130px' }}
                      defaultValue={sch.closingTime}
                      id={`close_${sch._id}`}
                    />
                  </td>
                  <td>
                    {sch.dayName === 'Sunday' ? '6.0 hrs' : sch.dayName === 'Saturday' ? '9.0 hrs' : '10.0 hrs'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        const o = document.getElementById(`open_${sch._id}`).value;
                        const c = document.getElementById(`close_${sch._id}`).value;
                        handleUpdateSchedule(sch._id, o, c);
                      }}
                    >
                      <Save size={13} /> Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shops List */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px' }}>
          PixxTechnologies Bicycle Shops ({shops.length})
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
          {shops.map(s => (
            <div key={s._id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', background: s.status === 'Active' ? '#ffffff' : '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>{s.name}</span>
                <span className={`badge badge-${s.status === 'Active' ? 'present' : 'absent'}`}>
                  {s.status}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Code: <strong>{s.code}</strong></div>
              <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px', minHeight: '36px' }}>{s.address || 'London, UK'}</div>
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  className={`btn btn-sm ${s.status === 'Active' ? 'btn-outline' : 'btn-primary'}`}
                  style={{ width: '100%', fontSize: '11px', color: s.status === 'Active' ? '#dc2626' : undefined }}
                  onClick={() => handleToggleShopStatus(s)}
                >
                  {s.status === 'Active' ? 'Deactivate Shop' : 'Reactivate Shop'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
