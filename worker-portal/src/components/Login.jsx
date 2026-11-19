import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle, ShieldCheck, KeyRound, Check, X } from 'lucide-react';
import api from '../services/api';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Forgot password modal
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [resetTokenDev, setResetTokenDev] = useState('');

  // Reset password modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotSubmitting(true);
    setForgotMessage('');
    setResetTokenDev('');

    try {
      const res = await api.post('/worker/auth/forgot-password', { email: forgotEmail });
      setForgotMessage(res.data?.message || 'Password reset instructions generated.');
      if (res.data?.resetToken) {
        setResetTokenDev(res.data.resetToken);
      }
    } catch (err) {
      setForgotMessage(err.response?.data?.message || 'Error processing request.');
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetSubmitting(true);
    setError('');
    setResetSuccess('');

    try {
      const res = await api.post('/worker/auth/reset-password', {
        token: tokenInput,
        newPassword
      });
      setResetSuccess(res.data?.message || 'Password has been reset successfully!');
      setTimeout(() => {
        setResetModalOpen(false);
        setPassword('');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password.');
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="mobile-container" style={{ justifyContent: 'center' }}>
      <div className="auth-card">
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-flex', padding: '6px', background: '#ffffff', borderRadius: '12px', marginBottom: '12px' }}>
            <img src="/logo.jpg" alt="PIXX Logo" style={{ width: '48px', height: '36px', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px', margin: '0 0 4px' }}>
            Worker Portal
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            PIXX Retail Workforce & Self-Service
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>{error}</div>
          </div>
        )}

        {resetSuccess && (
          <div className="alert alert-success">
            <Check size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>{resetSuccess}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Email Input */}
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-wrapper">
              <Mail size={18} className="input-icon" />
              <input
                type="email"
                required
                className="form-input"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotModalOpen(true);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Forgot?
              </button>
            </div>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="input-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
            style={{ marginTop: '8px' }}
          >
            {submitting ? (
              <>
                <div className="spin" style={{ width: '16px', height: '16px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%' }} />
                Signing in...
              </>
            ) : (
              <>
                <LogIn size={18} /> Sign In
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
          Need access? Contact your manager or supervisor to activate your account.
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11, 17, 32, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div className="auth-card" style={{ maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={18} color="var(--brand-primary)" />
                Password Recovery
              </h3>
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {forgotMessage ? (
              <div>
                <div className="alert alert-success">
                  <Check size={18} style={{ flexShrink: 0 }} />
                  <div>{forgotMessage}</div>
                </div>

                {resetTokenDev && (
                  <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px', wordBreak: 'break-all' }}>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Verification Reset Token:</div>
                    <code style={{ color: '#38bdf8' }}>{resetTokenDev}</code>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setTokenInput(resetTokenDev);
                      setForgotModalOpen(false);
                      setResetModalOpen(true);
                    }}
                  >
                    Enter Reset Token
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setForgotModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                  Enter your registered work email to receive password reset instructions.
                </p>

                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <div className="input-wrapper">
                    <Mail size={18} className="input-icon" />
                    <input
                      type="email"
                      required
                      className="form-input"
                      placeholder="name@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setForgotModalOpen(false)}
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={forgotSubmitting}
                    style={{ flex: 1 }}
                  >
                    {forgotSubmitting ? 'Sending...' : 'Send Request'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11, 17, 32, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div className="auth-card" style={{ maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={18} color="var(--brand-primary)" />
                Set New Password
              </h3>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label className="form-label">Reset Token</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  style={{ paddingLeft: '14px' }}
                  placeholder="Paste reset token"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
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

              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setResetModalOpen(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={resetSubmitting}
                  style={{ flex: 1 }}
                >
                  {resetSubmitting ? 'Resetting...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
