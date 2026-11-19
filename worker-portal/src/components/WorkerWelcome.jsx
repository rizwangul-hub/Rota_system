import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  User,
  ShieldCheck,
  Building2,
  Calendar,
  LogOut,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  X,
  Check
} from 'lucide-react';

export default function WorkerWelcome() {
  const { user, logout, changePassword } = useAuth();
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const employee = user?.employee || {};
  const shopName = employee.assignedShop?.name || 'Assigned Branch';

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      setMessage(res?.message || 'Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setChangePassOpen(false), 2000);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to update password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-container">
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src="/logo.jpg" alt="Pixx" style={{ width: '32px', height: '24px', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.2px' }}>PIXX WORKER</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Self-Service Portal</div>
          </div>
        </div>

        <button
          type="button"
          className="btn-outline"
          onClick={logout}
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          <LogOut size={14} /> Sign Out
        </button>
      </div>

      {/* Verified Worker Pass Card */}
      <div className="auth-card" style={{ marginBottom: '18px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div>
            <span className="badge badge-success">
              <CheckCircle2 size={12} /> Account Active & Verified
            </span>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '8px 0 2px', color: '#ffffff' }}>
              {employee.name || user?.name}
            </h2>
            <div style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 600 }}>
              {employee.jobTitle || 'Retail Assistant / Sales'}
            </div>
          </div>

          <div style={{ background: 'rgba(2, 132, 199, 0.2)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.3)', textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>ID Code</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>
              {employee.employeeId || 'PIXX---'}
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
              <Building2 size={13} /> Branch
            </div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{shopName}</div>
          </div>

          <div>
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
              <Calendar size={13} /> Started
            </div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {employee.startDate ? new Date(employee.startDate).toLocaleDateString() : 'Active Staff'}
            </div>
          </div>
        </div>
      </div>

      {/* Portal Status Notification */}
      <div className="auth-card" style={{ marginBottom: '18px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="#38bdf8" />
          Phase 1 Security & Authentication
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 14px' }}>
          Your worker account is linked directly to your PIXX employee profile. Your session is protected by end-to-end token encryption.
        </p>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setChangePassOpen(true)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <KeyRound size={15} /> Change Password
          </button>
        </div>
      </div>

      {/* Next Phases Preview */}
      <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Phase 1 Implementation Complete
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Coming in Phase 2+: Weekly Rota schedule, checked attendance history, and finalized payslips.
        </div>
      </div>

      {/* Change Password Modal */}
      {changePassOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11, 17, 32, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div className="auth-card" style={{ maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={18} color="var(--brand-primary)" />
                Change Password
              </h3>
              <button
                type="button"
                onClick={() => setChangePassOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="alert alert-error">
                <AlertCircle size={16} /> <div>{error}</div>
              </div>
            )}

            {message && (
              <div className="alert alert-success">
                <Check size={16} /> <div>{message}</div>
              </div>
            )}

            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  required
                  className="form-input"
                  style={{ paddingLeft: '14px' }}
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">New Password (Min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="form-input"
                  style={{ paddingLeft: '14px' }}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="form-input"
                  style={{ paddingLeft: '14px' }}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setChangePassOpen(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                  style={{ flex: 1 }}
                >
                  {submitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
