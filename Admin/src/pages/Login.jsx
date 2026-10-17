import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, User as UserIcon, ArrowRight, Eye, EyeOff, Shield, Download, Check } from 'lucide-react';
import logo from '../assets/logo.jpg';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const isRunningInstalled = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowInstallInstructions(false);
    };
    const handleDisplayModeChange = () => setIsInstalled(isRunningInstalled());
    const displayMode = window.matchMedia('(display-mode: standalone)');

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    displayMode.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      displayMode.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowInstallInstructions(true);
      return;
    }

    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setShowInstallInstructions(false);
      }
      setInstallPrompt(null);
    } catch (installError) {
      console.error('The browser could not open the Rota System install prompt:', installError);
      setShowInstallInstructions(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedUser = await login(username, password);
      // Route by role
      if (loggedUser.role === 'ATTENDANCE_CHECKER') {
        navigate('/attendance-checker');
      } else if (loggedUser.role === 'SALARY_DISTRIBUTOR') {
        navigate('/distributor');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        width: '100%',
        maxWidth: '440px',
        borderRadius: '16px',
        padding: '36px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            background: '#ffffff',
            width: '200px',
            height: '70px',
            borderRadius: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '10px'
          }}>
            <img src={logo} alt="Pixx Rota" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.3px' }}>
            Rota System
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
            Attendance • Payroll • Workforce
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '20px'
          }} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Username / Email</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8' }}>
                <UserIcon size={16} />
              </span>
              <input
                id="username"
                type="text"
                className="form-input"
                style={{ paddingLeft: '36px' }}
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label" htmlFor="password">Password</label>
            <div className="password-field-wrapper">
              <span style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8', zIndex: 1 }}>
                <Lock size={16} />
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                style={{ paddingLeft: '36px', paddingRight: '40px' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginBottom: '18px' }}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'} <ArrowRight size={16} />
          </button>
        </form>

        <div style={{ textAlign: 'center', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#64748b', fontSize: '12px' }}>
          <Shield size={14} color="#10b981" />
          <span>Secure workforce management</span>
        </div>

        <button
          type="button"
          className="btn btn-outline"
          onClick={handleInstall}
          disabled={isInstalled}
          style={{ width: '100%', justifyContent: 'center', gap: '8px' }}
        >
          {isInstalled ? <Check size={16} /> : <Download size={16} />}
          {isInstalled ? 'Rota System is already installed' : 'Install Rota System'}
        </button>

        {showInstallInstructions && !isInstalled && (
          <div
            role="status"
            style={{
              marginTop: '12px',
              padding: '12px',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              background: '#eff6ff',
              color: '#1e3a8a',
              fontSize: '12px'
            }}
          >
            <strong>Install Rota System in your browser</strong>
            <p style={{ marginTop: '4px' }}>
              In Chrome or Edge, open the browser menu and choose <strong>Install Rota System</strong> or
              {' '}<strong>Apps → Install this site as an app</strong>. If that option is missing, make sure
              you are using the secure website address and try again.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
