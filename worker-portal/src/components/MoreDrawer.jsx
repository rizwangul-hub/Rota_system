import React, { useState } from 'react';
import {
  X,
  User,
  KeyRound,
  LogOut,
  Building2,
  Calendar,
  ShieldCheck,
  Check,
  AlertCircle,
  QrCode,
  FileText,
  Palmtree,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function MoreDrawer({ worker, onClose, onSelectModule }) {
  const { logout, changePassword } = useAuth();
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const employee = worker || {};
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
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3 className="drawer-title">More & Account</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Worker Profile Card */}
        <div className="drawer-profile-card">
          <div className="drawer-profile-row">
            <div className="drawer-avatar">
              {employee.name
                ? employee.name
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                : 'W'}
            </div>
            <div>
              <div className="drawer-name">{employee.name || 'Worker'}</div>
              <div className="drawer-role">{employee.jobTitle || 'Staff'}</div>
              <div className="drawer-shop">
                <Building2 size={12} style={{ display: 'inline', marginRight: '4px' }} />
                {shopName}
              </div>
            </div>
            <div className="drawer-id-badge">{employee.employeeId || 'PIXX---'}</div>
          </div>
        </div>

        {/* Action Items List */}
        <div className="drawer-menu-list">
          <button
            type="button"
            className="drawer-menu-item"
            onClick={() => {
              onClose();
              onSelectModule?.({
                id: 'digital-card',
                title: 'Digital Employee Pass',
                desc: 'Verified worker ID card with secure QR code',
                badge: 'Phase 6'
              });
            }}
          >
            <QrCode size={18} className="item-icon text-cyan" />
            <span className="item-text">Digital Employee Pass</span>
            <span className="item-tag">Phase 6</span>
          </button>

          <button
            type="button"
            className="drawer-menu-item"
            onClick={() => {
              onClose();
              onSelectModule?.({
                id: 'leaves',
                title: 'Leave Requests',
                desc: 'Submit holiday, sick or emergency leave',
                badge: 'Phase 6'
              });
            }}
          >
            <Palmtree size={18} className="item-icon text-amber" />
            <span className="item-text">Leave Requests</span>
            <span className="item-tag">Phase 6</span>
          </button>

          <button
            type="button"
            className="drawer-menu-item"
            onClick={() => {
              onClose();
              onSelectModule?.({
                id: 'ledger',
                title: 'My Salary Ledger',
                desc: 'Payment receipts & running balance history',
                badge: 'Phase 5'
              });
            }}
          >
            <FileText size={18} className="item-icon text-purple" />
            <span className="item-text">Salary Ledger</span>
            <span className="item-tag">Phase 5</span>
          </button>

          <button
            type="button"
            className="drawer-menu-item"
            onClick={() => {
              onClose();
              onSelectModule?.({
                id: 'support',
                title: 'Help & Support',
                desc: 'Submit a ticket or salary query',
                badge: 'Phase 6'
              });
            }}
          >
            <HelpCircle size={18} className="item-icon text-teal" />
            <span className="item-text">Help & Support</span>
            <span className="item-tag">Phase 6</span>
          </button>

          <button
            type="button"
            className="drawer-menu-item"
            onClick={() => setChangePassOpen(!changePassOpen)}
          >
            <KeyRound size={18} className="item-icon text-blue" />
            <span className="item-text">Change Password</span>
          </button>
        </div>

        {/* Change Password Inline Form */}
        {changePassOpen && (
          <form className="drawer-change-pass-form" onSubmit={handleChangePassword}>
            <div className="form-title">Update Your Password</div>
            {error && (
              <div className="alert alert-error" style={{ padding: '8px 10px', fontSize: '12px' }}>
                <AlertCircle size={14} /> <span>{error}</span>
              </div>
            )}
            {message && (
              <div className="alert alert-success" style={{ padding: '8px 10px', fontSize: '12px' }}>
                <Check size={14} /> <span>{message}</span>
              </div>
            )}
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <input
                type="password"
                required
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '13px' }}
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <input
                type="password"
                required
                minLength={8}
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '13px' }}
                placeholder="New password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <input
                type="password"
                required
                minLength={8}
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '13px' }}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              style={{ padding: '8px 12px', fontSize: '13px' }}
            >
              {submitting ? 'Updating...' : 'Save Password'}
            </button>
          </form>
        )}

        {/* Sign Out Button */}
        <div className="drawer-footer">
          <button
            type="button"
            className="btn-signout"
            onClick={() => {
              onClose();
              logout();
            }}
          >
            <LogOut size={16} /> Sign Out of Worker Portal
          </button>
        </div>
      </div>
    </div>
  );
}
