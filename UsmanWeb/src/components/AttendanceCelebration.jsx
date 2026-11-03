import React, { useEffect, useState, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Sparkles, X } from 'lucide-react';

/**
 * AttendanceCelebration
 * Celebratory overlay with:
 * - Floating multi-colored SVG balloons
 * - Cascading multi-angle confetti
 * - Twinkling celebratory sparkles
 * - Premium success card ("🎉 Attendance Submitted Successfully! Your attendance has been sent to Sarfraz.")
 * - Auto-removes after ~4s with smooth fade
 */

// Palette: Blue, Green, Yellow, Purple, Pink, Orange, Cyan
const BALLOON_COLORS = [
  { main: '#3b82f6', light: '#93c5fd', dark: '#1d4ed8' }, // Blue
  { main: '#10b981', light: '#6ee7b7', dark: '#047857' }, // Green
  { main: '#eab308', light: '#fde047', dark: '#a16207' }, // Yellow
  { main: '#a855f7', light: '#d8b4fe', dark: '#7e22ce' }, // Purple
  { main: '#ec4899', light: '#f9a8d4', dark: '#be185d' }, // Pink
  { main: '#f97316', light: '#fdba74', dark: '#c2410c' }, // Orange
  { main: '#06b6d4', light: '#67e8f9', dark: '#0e7490' }  // Cyan
];

// Confetti hex colors
const CONFETTI_COLORS = ['#3b82f6', '#10b981', '#eab308', '#a855f7', '#ec4899', '#f97316', '#06b6d4'];

export default function AttendanceCelebration({
  show,
  onClose,
  soundEnabled = false,
  recipientName = 'Sarfraz'
}) {
  const [fading, setFading] = useState(false);

  // Generate randomized balloon properties once per show
  const balloons = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => {
      const color = BALLOON_COLORS[i % BALLOON_COLORS.length];
      const leftPercent = Math.min(92, Math.max(8, (i * 7 + Math.random() * 5) % 100));
      const size = 36 + Math.floor(Math.random() * 28); // 36px to 64px
      const duration = 2.8 + Math.random() * 1.6; // 2.8s to 4.4s
      const delay = Math.random() * 0.7; // 0s to 0.7s
      const swayDuration = 1.4 + Math.random() * 0.8;
      const swayAmount = 15 + Math.random() * 20;

      return { id: i, color, leftPercent, size, duration, delay, swayDuration, swayAmount };
    });
  }, [show]);

  // Generate sparkles
  const sparkles = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => ({
      id: i,
      top: 15 + Math.random() * 60,
      left: 10 + Math.random() * 80,
      size: 16 + Math.random() * 14,
      delay: Math.random() * 1.2
    }));
  }, [show]);

  useEffect(() => {
    if (!show) return;

    setFading(false);

    // Optional synthesized web audio chime (disabled by default)
    if (soundEnabled && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.24); // G5
        osc.frequency.setValueAtTime(1046.5, now + 0.36); // C6
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.7);
      } catch {
        // Ignore audio failures
      }
    }

    // Fire Confetti multi-burst
    try {
      // 1. Center explosion
      confetti({
        particleCount: 80,
        spread: 90,
        origin: { y: 0.55 },
        colors: CONFETTI_COLORS,
        disableForReducedMotion: true,
        zIndex: 999998
      });

      // 2. Left and right cannons slightly delayed
      const t1 = setTimeout(() => {
        confetti({
          particleCount: 45,
          angle: 60,
          spread: 60,
          origin: { x: 0.05, y: 0.65 },
          colors: CONFETTI_COLORS,
          disableForReducedMotion: true,
          zIndex: 999998
        });
        confetti({
          particleCount: 45,
          angle: 120,
          spread: 60,
          origin: { x: 0.95, y: 0.65 },
          colors: CONFETTI_COLORS,
          disableForReducedMotion: true,
          zIndex: 999998
        });
      }, 300);

      // Clean timer
      return () => clearTimeout(t1);
    } catch {
      // Confetti fallback
    }

    // Auto-fadeout after ~3.5 seconds
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 3500);

    // Complete cleanup and unmount after 3.9 seconds
    const autoCloseTimer = setTimeout(() => {
      if (onClose) onClose();
    }, 3900);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(autoCloseTimer);
    };
  }, [show, soundEnabled, onClose]);

  const handleManualClose = () => {
    setFading(true);
    setTimeout(() => {
      if (onClose) onClose();
    }, 200);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-live="assertive"
      aria-label="Attendance Submitted Successfully"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999990,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.4s ease-out',
        padding: '16px',
        overflow: 'hidden',
        pointerEvents: 'auto'
      }}
      onClick={handleManualClose}
    >
      <style>{`
        @keyframes floatUpward {
          0% {
            transform: translateY(105vh) scale(0.85);
            opacity: 0;
          }
          10% {
            opacity: 0.95;
          }
          90% {
            opacity: 0.95;
          }
          100% {
            transform: translateY(-130px) scale(1.05);
            opacity: 0;
          }
        }

        @keyframes swaySide {
          0%, 100% {
            margin-left: 0px;
            transform: rotate(-3deg);
          }
          50% {
            margin-left: 20px;
            transform: rotate(3deg);
          }
        }

        @keyframes popModalIn {
          0% {
            opacity: 0;
            transform: scale(0.82) translateY(20px);
          }
          65% {
            transform: scale(1.03) translateY(-2px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes sparkleTwinkle {
          0%, 100% {
            opacity: 0;
            transform: scale(0.3) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1.1) rotate(90deg);
          }
        }

        @keyframes badgePulse {
          0% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
          }
          70% {
            box-shadow: 0 0 0 16px rgba(34, 197, 94, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
          }
        }

        .celebration-balloon {
          position: absolute;
          bottom: 0;
          will-change: transform, opacity;
          pointer-events: none;
        }

        .celebration-sparkle {
          position: absolute;
          color: #fbbf24;
          will-change: transform, opacity;
          pointer-events: none;
        }

        .celebration-card {
          animation: popModalIn 0.45s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .celebration-balloon,
          .celebration-sparkle {
            display: none !important;
          }
          .celebration-card {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* Floating Animated Balloons */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {balloons.map((b) => (
          <div
            key={b.id}
            className="celebration-balloon"
            style={{
              left: `${b.leftPercent}%`,
              animation: `floatUpward ${b.duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${b.delay}s forwards`
            }}
          >
            <div
              style={{
                animation: `swaySide ${b.swayDuration}s ease-in-out infinite alternate`
              }}
            >
              {/* Balloon SVG with realistic highlights and string */}
              <svg
                width={b.size}
                height={b.size * 1.45}
                viewBox="0 0 50 72.5"
                fill="none"
                style={{ filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.18))' }}
              >
                <defs>
                  <radialGradient id={`balloon-grad-${b.id}`} cx="35%" cy="35%" r="65%">
                    <stop offset="0%" stopColor={b.color.light} />
                    <stop offset="45%" stopColor={b.color.main} />
                    <stop offset="100%" stopColor={b.color.dark} />
                  </radialGradient>
                </defs>
                {/* Balloon Body */}
                <ellipse cx="25" cy="25" rx="22" ry="24" fill={`url(#balloon-grad-${b.id})`} />
                {/* Specular reflection gloss */}
                <ellipse cx="18" cy="16" rx="6" ry="9" fill="rgba(255, 255, 255, 0.45)" transform="rotate(-20 18 16)" />
                {/* Knot */}
                <polygon points="22,48 28,48 26,52 24,52" fill={b.color.dark} />
                {/* String */}
                <path
                  d="M25 52 Q 22 58, 26 64 T 24 72"
                  stroke="rgba(255, 255, 255, 0.6)"
                  strokeWidth="1.2"
                  fill="none"
                />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* Sparkles */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {sparkles.map((s) => (
          <div
            key={s.id}
            className="celebration-sparkle"
            style={{
              top: `${s.top}%`,
              left: `${s.left}%`,
              animation: `sparkleTwinkle 1.8s ease-in-out ${s.delay}s infinite`
            }}
          >
            <Sparkles size={s.size} />
          </div>
        ))}
      </div>

      {/* Centered Celebration Success Modal */}
      <div
        className="celebration-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          padding: '28px 24px',
          maxWidth: '380px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(226, 232, 240, 0.8)',
          zIndex: 10
        }}
      >
        {/* Dismiss Button */}
        <button
          type="button"
          onClick={handleManualClose}
          aria-label="Close celebration"
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
            color: '#64748b',
            transition: 'background-color 0.15s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
        >
          <X size={16} />
        </button>

        {/* Celebratory Checkmark Icon */}
        <div
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            backgroundColor: '#dcfce7',
            color: '#15803d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            animation: 'badgePulse 1.8s infinite'
          }}
        >
          <CheckCircle2 size={40} strokeWidth={2.5} />
        </div>

        {/* Heading */}
        <h2
          style={{
            fontSize: '19px',
            fontWeight: 800,
            color: '#0f172a',
            margin: '0 0 8px 0',
            lineHeight: 1.3
          }}
        >
          🎉 Attendance Submitted Successfully!
        </h2>

        {/* Message to Sarfraz */}
        <p
          style={{
            fontSize: '14px',
            color: '#475569',
            margin: '0 0 20px 0',
            lineHeight: 1.5,
            fontWeight: 500
          }}
        >
          Your attendance has been sent to{' '}
          <strong style={{ color: '#1e293b', fontWeight: 700 }}>{recipientName}</strong> for review.
        </p>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleManualClose}
          style={{
            width: '100%',
            padding: '11px 18px',
            borderRadius: '12px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            transition: 'background-color 0.15s, transform 0.1s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          Great, Continue
        </button>
      </div>
    </div>
  );
}
