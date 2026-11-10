import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Lock } from 'lucide-react';
import rotaLogo from '../assets/rota.png';

export default function AuthLoadingScreen({ onRetry }) {
  const [statusIndex, setStatusIndex] = useState(0);
  const [showSlowNotice, setShowSlowNotice] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const statuses = [
    'Restoring your secure session...',
    'Verifying your credentials...',
    'Loading your workspace...',
    'Preparing your dashboard...'
  ];

  useEffect(() => {
    // Progressive authentication status progression
    const timers = [
      setTimeout(() => setStatusIndex(1), 1200),
      setTimeout(() => setStatusIndex(2), 2600),
      setTimeout(() => setStatusIndex(3), 4500),
      // If still loading after 8.5 seconds, show graceful timeout hint with retry
      setTimeout(() => setShowSlowNotice(true), 8500)
    ];

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  const handleRetryClick = async () => {
    if (retrying) return;
    setRetrying(true);
    setStatusIndex(0);
    setShowSlowNotice(false);
    try {
      if (onRetry) {
        await onRetry();
      } else {
        window.location.reload();
      }
    } finally {
      setTimeout(() => setRetrying(false), 1500);
    }
  };

  return (
    <div className="pixx-auth-loading-screen" role="status" aria-live="polite">
      {/* Self-contained responsive styles and keyframe animations */}
      <style>{`
        .pixx-auth-loading-screen {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justifyContent: space-between;
          min-height: 100vh;
          min-height: 100dvh;
          width: 100vw;
          background-color: #080c16;
          background-image:
            radial-gradient(circle at 50% 35%, rgba(37, 99, 235, 0.16) 0%, rgba(99, 102, 241, 0.08) 45%, transparent 70%),
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
          background-size: 100% 100%, 48px 48px, 48px 48px;
          overflow: hidden;
          padding: 24px 16px;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #f8fafc;
          animation: pixxAuthFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Ambient glowing orbs in the background */
        .pixx-auth-orb {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(90px);
          opacity: 0.55;
          will-change: transform;
        }
        .pixx-auth-orb-1 {
          width: 380px;
          height: 380px;
          top: -80px;
          left: -80px;
          background: radial-gradient(circle, rgba(14, 165, 233, 0.32) 0%, rgba(37, 99, 235, 0.15) 60%, transparent 80%);
          animation: pixxFloatOrb1 10s ease-in-out infinite alternate;
        }
        .pixx-auth-orb-2 {
          width: 420px;
          height: 420px;
          bottom: -100px;
          right: -100px;
          background: radial-gradient(circle, rgba(129, 140, 248, 0.28) 0%, rgba(79, 70, 229, 0.12) 60%, transparent 80%);
          animation: pixxFloatOrb2 12s ease-in-out infinite alternate;
        }

        /* Center Content Card */
        .pixx-auth-card {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          margin: auto 0;
          max-width: 460px;
          width: 100%;
          padding: 36px 28px;
          border-radius: 24px;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 20px 50px -10px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 255, 255, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        /* Logo presentation */
        .pixx-logo-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justifyContent: center;
          margin-bottom: 24px;
        }

        /* Subtle rotating glow ring */
        .pixx-logo-aura {
          position: absolute;
          inset: -14px;
          border-radius: 28px;
          background: conic-gradient(from 0deg, transparent 0%, rgba(56, 189, 248, 0.5) 30%, rgba(129, 140, 248, 0.5) 60%, transparent 100%);
          animation: pixxRotateConic 4s linear infinite;
          filter: blur(8px);
          opacity: 0.65;
        }

        .pixx-logo-badge {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px 28px;
          border-radius: 20px;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.36),
            inset 0 1px 1px rgba(255, 255, 255, 0.2);
          transition: transform 0.3s ease;
        }

        .pixx-logo-img {
          height: 64px;
          width: auto;
          max-width: 220px;
          object-fit: contain;
          display: block;
          filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4));
          animation: pixxLogoBreathe 3.5s ease-in-out infinite;
        }

        /* Brand Headings */
        .pixx-brand-title {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 2px;
          margin: 0 0 6px 0;
          background: linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-transform: uppercase;
        }

        .pixx-brand-subtitle {
          font-size: 13px;
          font-weight: 500;
          color: #94a3b8;
          letter-spacing: 0.3px;
          margin: 0 0 28px 0;
          line-height: 1.4;
        }

        /* Progress line */
        .pixx-progress-container {
          width: 100%;
          max-width: 260px;
          height: 4px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.08);
          overflow: hidden;
          position: relative;
          margin-bottom: 18px;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
        }

        .pixx-progress-bar {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 45%;
          border-radius: 9999px;
          background: linear-gradient(90deg, #38bdf8 0%, #6366f1 50%, #a855f7 100%);
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.7);
          animation: pixxIndeterminate 1.8s ease-in-out infinite;
        }

        /* Status Text Container */
        .pixx-status-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 22px;
        }

        .pixx-status-text {
          font-size: 13px;
          font-weight: 500;
          color: #e2e8f0;
          letter-spacing: 0.2px;
          animation: pixxStatusFade 0.4s ease-out;
        }

        /* Security chip */
        .pixx-security-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 18px;
          padding: 4px 12px;
          border-radius: 100px;
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          letter-spacing: 0.3px;
        }

        /* Slow connection box */
        .pixx-slow-notice {
          margin-top: 18px;
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(234, 179, 8, 0.25);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          animation: pixxAuthFadeIn 0.3s ease;
        }

        .pixx-slow-text {
          font-size: 12px;
          color: #fde047;
          margin: 0;
        }

        .pixx-retry-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 8px;
          background: #2563eb;
          color: #ffffff;
          border: none;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
        }
        .pixx-retry-btn:hover {
          background: #1d4ed8;
          transform: translateY(-1px);
        }

        /* Footer */
        .pixx-auth-footer {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 11.5px;
          color: #64748b;
          letter-spacing: 0.3px;
          text-align: center;
          padding-top: 12px;
        }

        .pixx-footer-dot {
          opacity: 0.5;
        }

        /* Keyframes */
        @keyframes pixxAuthFadeIn {
          from {
            opacity: 0;
            transform: scale(0.99);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes pixxIndeterminate {
          0% {
            left: -45%;
          }
          50% {
            left: 30%;
            width: 55%;
          }
          100% {
            left: 100%;
            width: 45%;
          }
        }

        @keyframes pixxRotateConic {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes pixxLogoBreathe {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.025);
          }
        }

        @keyframes pixxStatusFade {
          from {
            opacity: 0;
            transform: translateY(3px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pixxFloatOrb1 {
          0% {
            transform: translate(0, 0) scale(1);
          }
          100% {
            transform: translate(40px, 30px) scale(1.1);
          }
        }

        @keyframes pixxFloatOrb2 {
          0% {
            transform: translate(0, 0) scale(1);
          }
          100% {
            transform: translate(-30px, -40px) scale(1.08);
          }
        }

        /* Mobile Adjustments (320px - 480px) */
        @media (max-width: 480px) {
          .pixx-auth-card {
            padding: 28px 20px;
            border-radius: 20px;
            margin: auto 0;
          }
          .pixx-logo-badge {
            padding: 12px 20px;
          }
          .pixx-logo-img {
            height: 52px;
            max-width: 180px;
          }
          .pixx-brand-title {
            font-size: 19px;
            letter-spacing: 1.5px;
          }
          .pixx-brand-subtitle {
            font-size: 12px;
            margin-bottom: 22px;
          }
          .pixx-progress-container {
            max-width: 220px;
          }
          .pixx-status-text {
            font-size: 12px;
          }
          .pixx-auth-footer {
            font-size: 10.5px;
            gap: 6px;
          }
        }

        /* Respect accessibility reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .pixx-auth-loading-screen,
          .pixx-logo-aura,
          .pixx-logo-img,
          .pixx-auth-orb-1,
          .pixx-auth-orb-2 {
            animation: none !important;
          }
          .pixx-progress-bar {
            width: 100%;
            animation: none !important;
          }
        }
      `}</style>

      {/* Decorative ambient blurred glowing orbs */}
      <div className="pixx-auth-orb pixx-auth-orb-1" aria-hidden="true" />
      <div className="pixx-auth-orb pixx-auth-orb-2" aria-hidden="true" />

      {/* Top spacer for optical centering */}
      <div style={{ height: '16px' }} aria-hidden="true" />

      {/* Center Main Loading Section */}
      <div className="pixx-auth-card">
        {/* Rota System Logo */}
        <div className="pixx-logo-wrapper">
          <div className="pixx-logo-aura" aria-hidden="true" />
          <div className="pixx-logo-badge">
            <img
              src={rotaLogo}
              alt="Rota System Logo"
              className="pixx-logo-img"
            />
          </div>
        </div>

        {/* Application Titles */}
        <h1 className="pixx-brand-title">Rota System</h1>
        <p className="pixx-brand-subtitle">
          Smart Workforce &amp; Attendance Management
        </p>

        {/* Animated glowing progress indicator line */}
        <div className="pixx-progress-container" aria-hidden="true">
          <div className="pixx-progress-bar" />
        </div>

        {/* Current Authentication Lifecycle Status */}
        <div className="pixx-status-row">
          <ShieldCheck size={15} color="#38bdf8" />
          <span key={statusIndex} className="pixx-status-text">
            {statuses[statusIndex]}
          </span>
        </div>

        {/* Security badge indicator */}
        <div className="pixx-security-chip">
          <Lock size={11} color="#60a5fa" />
          <span>256-Bit Encrypted Session</span>
        </div>

        {/* Long-loading notice with safe retry fallback */}
        {showSlowNotice && (
          <div className="pixx-slow-notice">
            <p className="pixx-slow-text">
              Connection is taking longer than usual.
            </p>
            <button
              type="button"
              className="pixx-retry-btn"
              onClick={handleRetryClick}
              disabled={retrying}
            >
              <RefreshCw size={12} className={retrying ? 'spin' : ''} />
              <span>{retrying ? 'Retrying...' : 'Retry Connection'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Professional Footer */}
      <footer className="pixx-auth-footer">
        <span>Secure Workforce Management</span>
        <span className="pixx-footer-dot">&bull;</span>
        <span>Powered by PIXX Technologies</span>
      </footer>
    </div>
  );
}
