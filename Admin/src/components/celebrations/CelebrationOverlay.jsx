import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { X } from 'lucide-react';
import './CelebrationOverlay.css';
import RotaGenerationCelebration from './RotaGenerationCelebration';
import PayrollCelebration from './PayrollCelebration';
import AttendanceApprovalCelebration from './AttendanceApprovalCelebration';

// Theme-specific Confetti Palettes
const ROTA_CONFETTI = ['#06b6d4', '#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b'];
const PAYROLL_CONFETTI = ['#10b981', '#059669', '#f59e0b', '#fbbf24', '#06b6d4', '#a855f7'];
const ATTENDANCE_CONFETTI = ['#ec4899', '#f97316', '#eab308', '#a855f7', '#06b6d4', '#10b981'];

export default function CelebrationOverlay({
  show,
  onClose,
  type = 'rota', // 'rota' | 'payroll' | 'attendance'
  data = {},     // { weekLabel, totalAmount, employeeCount, approvedCount }
  duration = 4200,
  soundEnabled = false
}) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!show) return;

    setFading(false);

    // Audio chimes completely disabled for Admin Dashboard as requested

    // Trigger customized canvas-confetti bursts
    const colors = type === 'rota' ? ROTA_CONFETTI : type === 'payroll' ? PAYROLL_CONFETTI : ATTENDANCE_CONFETTI;

    try {
      // First center explosion
      confetti({
        particleCount: 70,
        spread: 80,
        origin: { y: 0.58 },
        colors,
        disableForReducedMotion: true,
        zIndex: 100000
      });

      // Left and right side bursts
      const leftTimer = setTimeout(() => {
        confetti({
          particleCount: 45,
          angle: 60,
          spread: 60,
          origin: { x: 0.1, y: 0.65 },
          colors,
          disableForReducedMotion: true,
          zIndex: 100000
        });
      }, 250);

      const rightTimer = setTimeout(() => {
        confetti({
          particleCount: 45,
          angle: 120,
          spread: 60,
          origin: { x: 0.9, y: 0.65 },
          colors,
          disableForReducedMotion: true,
          zIndex: 100000
        });
      }, 450);

      // Auto-fade timer
      const fadeTimer = setTimeout(() => {
        setFading(true);
      }, duration - 450);

      // Final close timer
      const closeTimer = setTimeout(() => {
        if (onClose) onClose();
      }, duration);

      return () => {
        clearTimeout(leftTimer);
        clearTimeout(rightTimer);
        clearTimeout(fadeTimer);
        clearTimeout(closeTimer);
      };
    } catch (err) {
      console.warn('Confetti error:', err);
    }
  }, [show, type, duration, soundEnabled, onClose]);

  // Handle ESC key to dismiss
  useEffect(() => {
    if (!show) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div
      className={`celebration-overlay ${fading ? 'fading-out' : ''}`}
      onClick={(e) => {
        // Click outside the card to dismiss
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Success Celebration"
    >
      {/* Dismiss Button */}
      <button
        type="button"
        className="celebration-card-close"
        onClick={onClose}
        title="Dismiss celebration"
        aria-label="Close"
      >
        <X size={16} />
      </button>

      {/* Dynamic Celebration Views */}
      {type === 'rota' && <RotaGenerationCelebration weekLabel={data.weekLabel} />}
      {type === 'payroll' && (
        <PayrollCelebration
          totalAmount={data.totalAmount}
          employeeCount={data.employeeCount}
        />
      )}
      {type === 'attendance' && (
        <AttendanceApprovalCelebration approvedCount={data.approvedCount} />
      )}
    </div>
  );
}
