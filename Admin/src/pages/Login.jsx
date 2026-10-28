import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Lock,
  User as UserIcon,
  ArrowRight,
  Eye,
  EyeOff,
  Shield,
  Download,
  Check,
  Smartphone,
  Share,
  PlusSquare,
  MoreVertical,
  X,
  Sparkles,
  Monitor
} from 'lucide-react';
import logo from '../assets/logo.jpg';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() =>
    typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    )
  );
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);

  const isIOSDevice = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
  const isAndroidDevice = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const initialOs = isIOSDevice ? 'ios' : isAndroidDevice ? 'android' : 'desktop';
  const [activeOsTab, setActiveOsTab] = useState(initialOs);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleBackToPortal = () => {
    const PORTAL_URL = 'https://pixxtech.vercel.app';

    // If inside Central Portal iframe, notify parent portal and redirect the main window
    if (window.top && window.top !== window.self) {
      try {
        window.top.postMessage('PIXXTECH_RETURN', '*');
        window.top.location.href = PORTAL_URL;
      } catch (e) {
        window.location.href = PORTAL_URL;
      }
    } else {
      // If opened directly in a browser tab
      window.location.href = PORTAL_URL;
    }
  };

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
    // If native prompt is available (Android Chrome, Edge, Chromium)
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setShowInstallInstructions(false);
          setInstallPrompt(null);
          return;
        }
      } catch (installError) {
        console.warn('The browser could not open the native install prompt:', installError);
      }
    }

    // Fallback or iOS Safari: show beautiful step-by-step device guide
    setActiveOsTab(isIOSDevice ? 'ios' : isAndroidDevice ? 'android' : 'desktop');
    setShowInstallInstructions(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedUser = await login(username, password);
      // Route by role
      if (loggedUser.role === 'ATTENDANCE_CHECKER' || loggedUser.role === 'ATTENDANCE_OPERATOR') {
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
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={handleBackToPortal}
            className="portal-back-btn"
            title="Return to PixxTech Central Portal"
          >
            ← PixxTech Portal
          </button>
        </div>

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

        {/* Responsive Mobile / Desktop Install Modal */}
        {showInstallInstructions && !isInstalled && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(4px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
            onClick={() => setShowInstallInstructions(false)}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                maxWidth: '430px',
                width: '100%',
                padding: '24px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                position: 'relative',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#eff6ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Smartphone size={20} color="#2563eb" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                      Install Rota System
                    </h3>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                      Add mobile web shortcut directly to your screen
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInstallInstructions(false)}
                  style={{
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#64748b'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* OS Tabs */}
              <div style={{
                display: 'flex',
                background: '#f8fafc',
                padding: '4px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                marginBottom: '16px',
                gap: '4px'
              }}>
                <button
                  type="button"
                  onClick={() => setActiveOsTab('ios')}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: '7px',
                    border: 'none',
                    background: activeOsTab === 'ios' ? '#ffffff' : 'transparent',
                    color: activeOsTab === 'ios' ? '#0f172a' : '#64748b',
                    fontWeight: activeOsTab === 'ios' ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                    boxShadow: activeOsTab === 'ios' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  🍏 iPhone (iOS)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveOsTab('android')}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: '7px',
                    border: 'none',
                    background: activeOsTab === 'android' ? '#ffffff' : 'transparent',
                    color: activeOsTab === 'android' ? '#0f172a' : '#64748b',
                    fontWeight: activeOsTab === 'android' ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                    boxShadow: activeOsTab === 'android' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  🤖 Android
                </button>
                <button
                  type="button"
                  onClick={() => setActiveOsTab('desktop')}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: '7px',
                    border: 'none',
                    background: activeOsTab === 'desktop' ? '#ffffff' : 'transparent',
                    color: activeOsTab === 'desktop' ? '#0f172a' : '#64748b',
                    fontWeight: activeOsTab === 'desktop' ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                    boxShadow: activeOsTab === 'desktop' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  💻 Desktop / PC
                </button>
              </div>

              {/* iOS Guide */}
              {activeOsTab === 'ios' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <span style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>1</span>
                    <div style={{ fontSize: '13px', color: '#1e293b' }}>
                      Tap the <strong>Share</strong> icon{' '}
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        verticalAlign: 'middle',
                        background: '#eff6ff',
                        color: '#2563eb',
                        padding: '2px 6px',
                        borderRadius: '5px',
                        fontWeight: 700,
                        fontSize: '11px'
                      }}>
                        <Share size={13} style={{ marginRight: '3px' }} /> Share
                      </span>
                      {' '}at the bottom bar of Safari.
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <span style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>2</span>
                    <div style={{ fontSize: '13px', color: '#1e293b' }}>
                      Scroll down in the share sheet and tap{' '}
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        verticalAlign: 'middle',
                        background: '#eff6ff',
                        color: '#2563eb',
                        padding: '2px 6px',
                        borderRadius: '5px',
                        fontWeight: 700,
                        fontSize: '11px'
                      }}>
                        <PlusSquare size={13} style={{ marginRight: '3px' }} /> Add to Home Screen
                      </span>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <span style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>3</span>
                    <div style={{ fontSize: '13px', color: '#1e293b' }}>
                      Tap <strong>Add</strong> in the top right. The Rota System icon will appear immediately on your home screen!
                    </div>
                  </div>

                  <div style={{
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    color: '#065f46',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '4px'
                  }}>
                    <Sparkles size={16} color="#059669" style={{ flexShrink: 0 }} />
                    <span>Launches in full-screen standalone mode with no browser address bar!</span>
                  </div>
                </div>
              )}

              {/* Android Guide */}
              {activeOsTab === 'android' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {installPrompt && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={async () => {
                        try {
                          await installPrompt.prompt();
                          const { outcome } = await installPrompt.userChoice;
                          if (outcome === 'accepted') {
                            setIsInstalled(true);
                            setShowInstallInstructions(false);
                            setInstallPrompt(null);
                          }
                        } catch (err) {
                          console.warn(err);
                        }
                      }}
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        gap: '6px',
                        marginBottom: '6px',
                        fontWeight: 700
                      }}
                    >
                      <Download size={16} /> Tap Here for 1-Click Android Install
                    </button>
                  )}

                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <span style={{
                      background: '#059669',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>1</span>
                    <div style={{ fontSize: '13px', color: '#1e293b' }}>
                      In Chrome, tap the <strong>three dots menu</strong>{' '}
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        verticalAlign: 'middle',
                        background: '#e2e8f0',
                        color: '#334155',
                        padding: '2px 5px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '11px'
                      }}>
                        <MoreVertical size={13} />
                      </span>
                      {' '}in the top right.
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <span style={{
                      background: '#059669',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>2</span>
                    <div style={{ fontSize: '13px', color: '#1e293b' }}>
                      Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong> from the menu.
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <span style={{
                      background: '#059669',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>3</span>
                    <div style={{ fontSize: '13px', color: '#1e293b' }}>
                      Tap <strong>Install</strong>. Android will download the shortcut icon onto your home screen!
                    </div>
                  </div>
                </div>
              )}

              {/* Desktop Guide */}
              {activeOsTab === 'desktop' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <span style={{
                      background: '#475569',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>1</span>
                    <div style={{ fontSize: '13px', color: '#1e293b' }}>
                      In Google Chrome or Microsoft Edge, look at the right side of the address bar at the top.
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <span style={{
                      background: '#475569',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>2</span>
                    <div style={{ fontSize: '13px', color: '#1e293b' }}>
                      Click the <strong>Install</strong> icon ⊕ in the address bar (or click <strong>Menu ⋮ → Save and share → Install Rota System</strong>).
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '18px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowInstallInstructions(false)}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Got It, Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
