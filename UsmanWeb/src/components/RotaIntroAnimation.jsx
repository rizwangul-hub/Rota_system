import React, { useState, useEffect } from 'react';
import logoImg from '../assets/logo.jpg';

/**
 * RotaIntroAnimation
 * Beautiful 3D rotation intro animation on app launch.
 * - Rotates around X-axis exactly 2 times (720deg).
 * - Smooth cubic-bezier easing with subtle luminous glow.
 * - Runs once per session (tracked in sessionStorage).
 * - Graceful fade-out to main app after ~1.8 seconds.
 */
export default function RotaIntroAnimation({ onComplete }) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Check if already shown in this session
    try {
      const alreadyShown = sessionStorage.getItem('pixx_rota_intro_shown');
      if (alreadyShown === 'true') {
        setVisible(false);
        if (onComplete) onComplete();
        return;
      }
    } catch {
      // Ignore sessionStorage errors (e.g. strict privacy mode)
    }

    // Phase 1: Logo completes 720deg rotation at ~1.5s
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 1550);

    // Phase 2: Fade-out transition completes at ~1.95s, then unmount
    const finishTimer = setTimeout(() => {
      try {
        sessionStorage.setItem('pixx_rota_intro_shown', 'true');
      } catch {
        // Ignore
      }
      setVisible(false);
      if (onComplete) onComplete();
    }, 1950);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [onComplete]);

  // Handle immediate user skip by tapping anywhere
  const handleSkip = () => {
    try {
      sessionStorage.setItem('pixx_rota_intro_shown', 'true');
    } catch {
      // Ignore
    }
    setFading(true);
    setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, 200);
  };

  if (!visible) return null;

  return (
    <div
      onClick={handleSkip}
      role="banner"
      aria-label="PixxTech Rota Intro"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        backgroundColor: '#0a0f1d',
        backgroundImage: 'radial-gradient(circle at 50% 45%, #1e293b 0%, #0a0f1d 75%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.4s ease-out',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        perspective: '1000px',
        overflow: 'hidden'
      }}
    >
      <style>{`
        @keyframes rotaLogoIntro {
          0% {
            transform: perspective(800px) rotateX(0deg) scale(0.75);
            opacity: 0;
            filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.3));
          }
          12% {
            opacity: 1;
          }
          50% {
            filter: drop-shadow(0 0 35px rgba(59, 130, 246, 0.8)) drop-shadow(0 0 60px rgba(99, 102, 241, 0.4));
          }
          85% {
            transform: perspective(800px) rotateX(720deg) scale(1.03);
          }
          100% {
            transform: perspective(800px) rotateX(720deg) scale(1);
            opacity: 1;
            filter: drop-shadow(0 0 25px rgba(59, 130, 246, 0.6)) drop-shadow(0 0 45px rgba(99, 102, 241, 0.3));
          }
        }

        @keyframes rotaHaloPulse {
          0%, 100% {
            transform: scale(0.9);
            opacity: 0.35;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.7;
          }
        }

        @keyframes rotaTextFadeIn {
          0% {
            opacity: 0;
            transform: translateY(12px);
          }
          60% {
            opacity: 0;
            transform: translateY(12px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .rota-logo-animated {
          animation: rotaLogoIntro 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform-style: preserve-3d;
          will-change: transform, opacity;
        }

        .rota-halo-animated {
          animation: rotaHaloPulse 1.8s ease-in-out infinite;
        }

        .rota-text-animated {
          animation: rotaTextFadeIn 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .rota-logo-animated {
            animation: none !important;
            transform: none !important;
            opacity: 1 !important;
          }
          .rota-halo-animated {
            animation: none !important;
          }
          .rota-text-animated {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* Subtle background ambient glow rings */}
      <div
        className="rota-halo-animated"
        style={{
          position: 'absolute',
          width: '280px',
          height: '280px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, rgba(99, 102, 241, 0.08) 50%, transparent 70%)',
          pointerEvents: 'none'
        }}
      />

      {/* Rotating Logo Card */}
      <div
        className="rota-logo-animated"
        style={{
          position: 'relative',
          width: '110px',
          height: '110px',
          borderRadius: '24px',
          backgroundColor: '#ffffff',
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1.5px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 30px rgba(59, 130, 246, 0.4)'
        }}
      >
        <img
          src={logoImg}
          alt="PixxTech Rota Logo"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain'
          }}
        />
      </div>

      {/* Brand Title and Subtitle */}
      <div
        className="rota-text-animated"
        style={{
          marginTop: '22px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <div
          style={{
            color: '#f8fafc',
            fontSize: '20px',
            fontWeight: 800,
            letterSpacing: '3px',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.4)'
          }}
        >
          PIXX ROTA
        </div>
        <div
          style={{
            color: '#94a3b8',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            marginTop: '4px'
          }}
        >
          Attendance & Operations
        </div>
      </div>

      {/* Subtle Skip Hint at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          fontSize: '11px',
          color: '#475569',
          fontWeight: 500,
          letterSpacing: '0.5px'
        }}
      >
        Tap to continue
      </div>
    </div>
  );
}
