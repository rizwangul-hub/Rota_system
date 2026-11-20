import React, { useEffect, useState, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Sparkles, X, ShieldCheck, Clock, Flame } from 'lucide-react';
import { playSubmissionSuccessSound } from '../utils/submissionSound';

/**
 * AttendanceCelebration
 * High-definition celebratory overlay for UsmanWeb:
 * - Synchronized FIREWORKS & FIRE effects (shooting rockets + explosion starbursts)
 * - Floating multi-colored SVG balloons
 * - Cascading multi-angle confetti & sparkling fire embers
 * - Audio: Firework launch whoosh -> BOOM & crackle -> celebratory clipping chime!
 * - Clear confirmation that attendance was submitted to Sarfraz Khan
 * - Live status badge: "Status: Submitted for Verification"
 */

// Balloon palette: Blue, Green, Yellow, Purple, Pink, Orange, Cyan
const BALLOON_COLORS = [
  { main: '#3b82f6', light: '#93c5fd', dark: '#1d4ed8' }, // Blue
  { main: '#10b981', light: '#6ee7b7', dark: '#047857' }, // Green
  { main: '#eab308', light: '#fde047', dark: '#a16207' }, // Yellow
  { main: '#a855f7', light: '#d8b4fe', dark: '#7e22ce' }, // Purple
  { main: '#ec4899', light: '#f9a8d4', dark: '#be185d' }, // Pink
  { main: '#f97316', light: '#fdba74', dark: '#c2410c' }, // Orange
  { main: '#06b6d4', light: '#67e8f9', dark: '#0e7490' }  // Cyan
];

// Firework colors (fire flames, embers, gold, neon bursts)
const FIRE_COLORS = ['#ff3d00', '#ff9100', '#ffd600', '#ff1744', '#ffffff', '#f59e0b'];
const CONFETTI_COLORS = ['#ff5722', '#3b82f6', '#10b981', '#eab308', '#a855f7', '#ec4899', '#06b6d4'];

export default function AttendanceCelebration({
  show,
  onClose,
  soundEnabled = true,
  recipientName = 'Sarfraz Khan',
  dateLabel = null,
  submittedCount = null
}) {
  const [fading, setFading] = useState(false);

  // Generate randomized balloon properties once per show
  const balloons = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => {
      const color = BALLOON_COLORS[i % BALLOON_COLORS.length];
      const leftPercent = Math.min(92, Math.max(8, (i * 7 + Math.random() * 5) % 100));
      const size = 36 + Math.floor(Math.random() * 26);
      const duration = 2.8 + Math.random() * 1.6;
      const delay = Math.random() * 0.6;
      const swayDuration = 1.4 + Math.random() * 0.8;
      const swayAmount = 15 + Math.random() * 20;

      return { id: i, color, leftPercent, size, duration, delay, swayDuration, swayAmount };
    });
  }, [show]);

  // Generate visual fireworks bursts
  const fireworks = useMemo(() => {
    return [
      { id: 1, top: 18, left: 22, color: '#ff5722', size: 130, delay: 0.35 },
      { id: 2, top: 22, left: 78, color: '#ff9800', size: 140, delay: 0.40 },
      { id: 3, top: 12, left: 50, color: '#ffd600', size: 160, delay: 0.48 },
      { id: 4, top: 28, left: 35, color: '#ec4899', size: 120, delay: 0.85 },
      { id: 5, top: 26, left: 65, color: '#06b6d4', size: 125, delay: 0.95 }
    ];
  }, [show]);

  // Generate twinkling sparkles / fire embers
  const sparkles = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      top: 10 + Math.random() * 70,
      left: 8 + Math.random() * 84,
      size: 14 + Math.random() * 16,
      delay: Math.random() * 1.4,
      isFire: i % 2 === 0
    }));
  }, [show]);

  useEffect(() => {
    if (!show) return;

    setFading(false);

    // 1. Play Fireworks + Clipping Chime sound
    if (soundEnabled) {
      try {
        playSubmissionSuccessSound();
      } catch (err) {
        // Non-blocking
      }
    }

    // 2. Synchronized Fireworks Bursts with canvas-confetti
    try {
      // 0ms: Initial upward rocket launch embers
      confetti({
        particleCount: 25,
        angle: 90,
        spread: 45,
        startVelocity: 55,
        origin: { x: 0.5, y: 0.9 },
        colors: FIRE_COLORS,
        disableForReducedMotion: true,
        zIndex: 999998
      });

      // 350ms: EXACT SYNC with FIREWORK BOOM sound!
      const tBoom = setTimeout(() => {
        // Giant center explosion
        confetti({
          particleCount: 95,
          spread: 100,
          startVelocity: 48,
          origin: { x: 0.5, y: 0.35 },
          colors: FIRE_COLORS,
          disableForReducedMotion: true,
          zIndex: 999998
        });

        // Left cannon explosion
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 70,
          startVelocity: 45,
          origin: { x: 0.15, y: 0.45 },
          colors: FIRE_COLORS,
          disableForReducedMotion: true,
          zIndex: 999998
        });

        // Right cannon explosion
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 70,
          startVelocity: 45,
          origin: { x: 0.85, y: 0.45 },
          colors: FIRE_COLORS,
          disableForReducedMotion: true,
          zIndex: 999998
        });
      }, 350);

      // 750ms: EXACT SYNC with CLIPPING CHIME melody start!
      const tChime = setTimeout(() => {
        confetti({
          particleCount: 65,
          spread: 90,
          origin: { x: 0.5, y: 0.5 },
          colors: CONFETTI_COLORS,
          disableForReducedMotion: true,
          zIndex: 999998
        });
      }, 750);

      return () => {
        clearTimeout(tBoom);
        clearTimeout(tChime);
      };
    } catch {
      // Confetti fallback
    }

    // Auto-fadeout after ~4.8 seconds
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 4800);

    // Complete cleanup after 5.2 seconds
    const autoCloseTimer = setTimeout(() => {
      if (onClose) onClose();
    }, 5200);

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
      aria-modal="true"
      aria-live="assertive"
      aria-label="Attendance Submitted Successfully"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999990,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10, 15, 30, 0.62)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
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

        @keyframes fireRocketRise {
          0% {
            transform: translateY(100vh) scale(0.6);
            opacity: 1;
          }
          75% {
            opacity: 1;
          }
          100% {
            transform: translateY(0) scale(1.2);
            opacity: 0;
          }
        }

        @keyframes fireworkBurst {
          0% {
            transform: scale(0.1);
            opacity: 0;
          }
          30% {
            transform: scale(0.8);
            opacity: 1;
          }
          70% {
            transform: scale(1.15);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.35);
            opacity: 0;
          }
        }

        @keyframes popModalIn {
          0% {
            opacity: 0;
            transform: scale(0.8) translateY(24px);
          }
          65% {
            transform: scale(1.02) translateY(-2px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes firePulse {
          0%, 100% {
            transform: scale(1);
            filter: drop-shadow(0 0 8px rgba(255, 87, 34, 0.8));
          }
          50% {
            transform: scale(1.15);
            filter: drop-shadow(0 0 16px rgba(255, 152, 0, 1));
          }
        }

        @keyframes badgePulse {
          0% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
          }
          70% {
            box-shadow: 0 0 0 18px rgba(34, 197, 94, 0);
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

        .firework-starburst {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          will-change: transform, opacity;
        }

        .celebration-sparkle {
          position: absolute;
          will-change: transform, opacity;
          pointer-events: none;
        }

        .celebration-card {
          animation: popModalIn 0.42s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .celebration-balloon,
          .firework-starburst,
          .celebration-sparkle {
            display: none !important;
          }
          .celebration-card {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* 1. VISUAL FIREWORKS STARBURSTS */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {fireworks.map((fw) => (
          <div
            key={fw.id}
            className="firework-starburst"
            style={{
              top: `${fw.top}%`,
              left: `${fw.left}%`,
              width: `${fw.size}px`,
              height: `${fw.size}px`,
              marginLeft: `-${fw.size / 2}px`,
              marginTop: `-${fw.size / 2}px`,
              animation: `fireworkBurst 1.2s ease-out ${fw.delay}s infinite`
            }}
          >
            {/* SVG Firework Radiating Sparks */}
            <svg width="100%" height="100%" viewBox="0 0 120 120" fill="none">
              <circle cx="60" cy="60" r="12" fill={fw.color} opacity="0.9" />
              <circle cx="60" cy="60" r="28" stroke="#ffd600" strokeWidth="2" strokeDasharray="4 6" opacity="0.8" />
              <circle cx="60" cy="60" r="48" stroke={fw.color} strokeWidth="2.5" strokeDasharray="3 8" opacity="0.75" />
              {/* Radiating Ray Sparks */}
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                <line
                  key={deg}
                  x1="60"
                  y1="60"
                  x2={60 + 52 * Math.cos((deg * Math.PI) / 180)}
                  y2={60 + 52 * Math.sin((deg * Math.PI) / 180)}
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.85"
                />
              ))}
            </svg>
          </div>
        ))}
      </div>

      {/* 2. FLOATING BALLOONS */}
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
              <svg
                width={b.size}
                height={b.size * 1.45}
                viewBox="0 0 50 72.5"
                fill="none"
                style={{ filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.22))' }}
              >
                <defs>
                  <radialGradient id={`balloon-grad-${b.id}`} cx="35%" cy="35%" r="65%">
                    <stop offset="0%" stopColor={b.color.light} />
                    <stop offset="45%" stopColor={b.color.main} />
                    <stop offset="100%" stopColor={b.color.dark} />
                  </radialGradient>
                </defs>
                <ellipse cx="25" cy="25" rx="22" ry="24" fill={`url(#balloon-grad-${b.id})`} />
                <ellipse cx="18" cy="16" rx="6" ry="9" fill="rgba(255, 255, 255, 0.45)" transform="rotate(-20 18 16)" />
                <polygon points="22,48 28,48 26,52 24,52" fill={b.color.dark} />
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

      {/* 3. FIRE EMBERS & SPARKLES */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {sparkles.map((s) => (
          <div
            key={s.id}
            className="celebration-sparkle"
            style={{
              top: `${s.top}%`,
              left: `${s.left}%`,
              color: s.isFire ? '#f97316' : '#fbbf24',
              animation: `firePulse 1.4s ease-in-out ${s.delay}s infinite`
            }}
          >
            {s.isFire ? <Flame size={s.size} /> : <Sparkles size={s.size} />}
          </div>
        ))}
      </div>

      {/* 4. CENTERED CELEBRATION MODAL */}
      <div
        className="celebration-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          padding: '28px 24px',
          maxWidth: '410px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.45), 0 0 0 1px rgba(226, 232, 240, 0.9)',
          zIndex: 10
        }}
      >
        {/* Dismiss Button */}
        <button
          type="button"
          onClick={handleManualClose}
          aria-label="Close confirmation"
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

        {/* Celebratory Checkmark Icon Badge */}
        <div
          style={{
            width: '74px',
            height: '74px',
            borderRadius: '50%',
            backgroundColor: '#dcfce7',
            color: '#15803d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            animation: 'badgePulse 1.8s infinite',
            border: '3px solid #bbf7d0'
          }}
        >
          <CheckCircle2 size={46} strokeWidth={2.4} />
        </div>

        {/* Tag Pill with Flame & Sparkles */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#c2410c',
            backgroundColor: '#fff7ed',
            border: '1px solid #fed7aa',
            padding: '4px 11px',
            borderRadius: '999px',
            marginBottom: '10px'
          }}
        >
          <Flame size={13} color="#ea580c" />
          <span>Attendance Confirmed</span>
          <Sparkles size={12} color="#f59e0b" />
        </div>

        {/* Heading */}
        <h2
          style={{
            fontSize: '20px',
            fontWeight: 800,
            color: '#0f172a',
            margin: '0 0 10px 0',
            lineHeight: 1.25,
            letterSpacing: '-0.02em'
          }}
        >
          ATTENDANCE SUBMITTED SUCCESSFULLY!
        </h2>

        {/* Recipient Confirmation */}
        <p
          style={{
            fontSize: '14px',
            color: '#334155',
            margin: '0 0 16px 0',
            lineHeight: 1.5,
            fontWeight: 500
          }}
        >
          Your daily attendance has been successfully submitted to{' '}
          <strong style={{ color: '#0f172a', fontWeight: 700 }}>{recipientName}</strong>.
        </p>

        {/* Status Box */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '12px 14px',
            marginBottom: '20px',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
              Verification Status
            </span>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#dcfce7',
                border: '1px solid #86efac',
                padding: '3px 9px',
                borderRadius: '999px'
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#16a34a',
                  display: 'inline-block'
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#166534' }}>
                Submitted for Verification
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <ShieldCheck size={14} color="#059669" />
            <span style={{ fontSize: '12px', color: '#475569', fontWeight: 500 }}>
              Waiting for Sarfraz Khan's review and approval
            </span>
          </div>

          {(dateLabel || submittedCount) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', borderTop: '1px dashed #e2e8f0', paddingTop: '6px' }}>
              <Clock size={13} color="#94a3b8" />
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                {[dateLabel, submittedCount].filter(Boolean).join(' • ')}
              </span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleManualClose}
          style={{
            width: '100%',
            padding: '12px 18px',
            borderRadius: '12px',
            backgroundColor: '#16a34a',
            color: '#ffffff',
            border: 'none',
            fontSize: '14px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
            transition: 'background-color 0.15s, transform 0.1s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#15803d')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#16a34a')}
        >
          <CheckCircle2 size={16} />
          <span>Great, Continue</span>
        </button>
      </div>
    </div>
  );
}
