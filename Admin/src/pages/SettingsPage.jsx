import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { Store, Clock, Shield, Plus, Save, Check } from 'lucide-react';

export default function SettingsPage() {
  const [shops, setShops] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [gracePeriod, setGracePeriod] = useState(15);
  const [loading, setLoading] = useState(true);
  const [newShopName, setNewShopName] = useState('');
  const [newShopAddress, setNewShopAddress] = useState('');
  const [newShopPhone, setNewShopPhone] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [shopsRes, schedRes, setRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/shops?includeInactive=true`),
        axios.get(`${API_BASE_URL}/shops/schedules`),
        axios.get(`${API_BASE_URL}/settings`)
      ]);

      if (shopsRes.data.success) setShops(shopsRes.data.shops);
      if (schedRes.data.success) setSchedules(schedRes.data.schedules);
      if (setRes.data.success && setRes.data.settings.GRACE_PERIOD_MINUTES !== undefined) {
        setGracePeriod(setRes.data.settings.GRACE_PERIOD_MINUTES);
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
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
