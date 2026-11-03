import React, { useState, useEffect } from 'react';
import { Smartphone, Download, Share, PlusSquare, Check, X, ArrowUpRight } from 'lucide-react';
import newLogo from '../assets/app-logo.png';

/**
 * InstallAppBanner
 * Provides a 1-tap PWA Install button on the login screen
 * Supports:
 * - Native Android/Chrome/Edge 1-click install via beforeinstallprompt
 * - iOS Safari step-by-step visual installation guide modal
 * - Detects if already running inside standalone app mode
 */
export default function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // 1. Detect standalone mode (already installed as PWA or in webview)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(Boolean(isStandaloneMode));
    };

    checkStandalone();

    // 2. Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent) && !window.MSStream;
    setIsIOS(isAppleDevice);

    // 3. Listen for Chrome / Android beforeinstallprompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    // 4. Listen for successful install event
    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowGuide(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    // If Android/Chrome prompt is ready, trigger native prompt
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          setInstalled(true);
        }
        setDeferredPrompt(null);
      } catch {
        setShowGuide(true);
      }
    } else {
      // Show step-by-step installation instructions (especially for iOS or manual install)
      setShowGuide(true);
    }
  };

  // If already running in standalone app mode, display a subtle confirmation badge
  if (isStandalone) {
    return (
      <div
        style={{
          marginTop: '16px',
          padding: '8px 12px',
          borderRadius: '10px',
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          fontSize: '11px',
          fontWeight: 700,
          color: '#15803d'
        }}
      >
        <Check size={14} />
        <span>Running in Mobile App Mode</span>
      </div>
    );
  }

  return (
    <>
      {/* Install App Card on Login Page */}
      <div
        style={{
          marginTop: '20px',
          padding: '12px 14px',
          borderRadius: '14px',
          backgroundColor: '#f8fafc',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              overflow: 'hidden',
              flexShrink: 0,
              boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
            }}
          >
            <img src={newLogo} alt="Attendance Rota" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
              Attendance Rota
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
              Install on your phone like an app
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleInstallClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '7px 12px',
            borderRadius: '9px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            border: 'none',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: '0 2px 4px rgba(15,23,42,0.2)',
            transition: 'background-color 0.15s, transform 0.1s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0f172a')}
        >
          <Download size={13} />
          <span>Install</span>
        </button>
      </div>

      {/* Step-by-Step Installation Modal Guide (for iOS Safari or manual Android) */}
      {showGuide && (
        <div
          role="dialog"
          aria-label="Install Instructions"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowGuide(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              padding: '24px',
              maxWidth: '350px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              textAlign: 'center',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                backgroundColor: '#f1f5f9',
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
              <X size={15} />
            </button>

            {/* App Icon */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                overflow: 'hidden',
                margin: '0 auto 12px auto',
                boxShadow: '0 8px 16px -4px rgba(0, 0, 0, 0.2)'
              }}
            >
              <img src={newLogo} alt="Attendance Rota" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>

            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
              Install "Attendance Rota"
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px 0', fontWeight: 500 }}>
              Add to your phone home screen to open directly like a mobile app.
            </p>

            {/* Platform Specific Steps */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                padding: '14px',
                textAlign: 'left',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
                color: '#334155',
                lineHeight: 1.6
              }}
            >
              {isIOS ? (
                <>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Share size={14} color="#2563eb" /> On iPhone / Safari:
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <strong>1.</strong> Tap the <strong>Share</strong> button <Share size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> at the bottom bar.
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <strong>2.</strong> Scroll down and tap <strong>"Add to Home Screen"</strong> <PlusSquare size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />.
                  </div>
                  <div>
                    <strong>3.</strong> Tap <strong>"Add"</strong> in the top-right corner.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Smartphone size={14} color="#2563eb" /> On Android / Chrome:
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <strong>1.</strong> Tap the <strong>3 dots (⋮)</strong> menu in the top-right of your browser.
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <strong>2.</strong> Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                  </div>
                  <div>
                    <strong>3.</strong> Tap <strong>"Install"</strong> to confirm.
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              style={{
                marginTop: '16px',
                width: '100%',
                padding: '10px',
                borderRadius: '10px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
