import React, { useMemo } from 'react';
import { CheckCircle2, HeartHandshake, Sparkles } from 'lucide-react';

const BALLOON_PALETTES = [
  { main: '#ec4899', knot: '#be185d' }, // Pink
  { main: '#f97316', knot: '#c2410c' }, // Orange
  { main: '#eab308', knot: '#a16207' }, // Yellow
  { main: '#a855f7', knot: '#7e22ce' }, // Purple
  { main: '#06b6d4', knot: '#0e7490' }, // Cyan
  { main: '#10b981', knot: '#047857' }  // Green
];

export default function AttendanceApprovalCelebration({ approvedCount }) {
  // Generate multi-colored balloons
  const balloons = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
      const palette = BALLOON_PALETTES[i % BALLOON_PALETTES.length];
      const left = 5 + (i * 8 + Math.random() * 5) % 90;
      const width = 34 + Math.floor(Math.random() * 26);
      const height = Math.floor(width * 1.25);
      const duration = 3.2 + Math.random() * 2;
      const delay = Math.random() * 1.2;

      return { id: i, palette, left, width, height, duration, delay };
    });
  }, []);

  return (
    <>
      {/* Background Floating Balloons */}
      <div className="celebration-particles-layer">
        {balloons.map((b) => (
          <div
            key={b.id}
            className="balloon-item"
            style={{
              left: `${b.left}%`,
              animationDuration: `${b.duration}s`,
              animationDelay: `${b.delay}s`
            }}
          >
            <div
              className="balloon-body"
              style={{
                width: `${b.width}px`,
                height: `${b.height}px`,
                backgroundColor: b.palette.main
              }}
            />
            <div
              className="balloon-knot"
              style={{ backgroundColor: b.palette.knot }}
            />
            <div className="balloon-string" />
          </div>
        ))}
      </div>

      {/* Main Celebration Card */}
      <div className="celebration-card celebration-card-attendance">
        {/* Animated Icon Header */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)',
              border: '2px solid #f472b6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(236, 72, 153, 0.25)'
            }}
          >
            <CheckCircle2 size={36} color="#db2777" />
          </div>
        </div>

        {/* Title and Message */}
        <h2 className="celebration-title" style={{ marginTop: 0 }}>
          🎊 Attendance Approved Successfully!
        </h2>

        <p className="celebration-subtitle">
          Daily attendance has been approved.
        </p>

        {/* Optional Approved Count Badge */}
        {approvedCount > 0 && (
          <div
            className="celebration-meta-badge"
            style={{
              background: '#fdf2f8',
              color: '#9d174d',
              border: '1px solid #fbcfe8'
            }}
          >
            <HeartHandshake size={15} />
            <span>{approvedCount} Staff Record{approvedCount > 1 ? 's' : ''} Checked & Approved</span>
          </div>
        )}
      </div>
    </>
  );
}
