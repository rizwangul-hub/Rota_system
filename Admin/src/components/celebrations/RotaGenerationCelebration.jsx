import React, { useMemo } from 'react';
import { Calendar, CheckCircle2, Sparkles } from 'lucide-react';

const DAYS = [
  { day: 'MON', color: '#06b6d4' },
  { day: 'TUE', color: '#0ea5e9' },
  { day: 'WED', color: '#3b82f6' },
  { day: 'THU', color: '#6366f1' },
  { day: 'FRI', color: '#8b5cf6' },
  { day: 'SAT', color: '#14b8a6' },
  { day: 'SUN', color: '#f59e0b' }
];

export default function RotaGenerationCelebration({ weekLabel }) {
  // Generate random twinkling stars for background
  const stars = useMemo(() => {
    return Array.from({ length: 10 }).map((_, i) => ({
      id: i,
      top: 15 + Math.random() * 70,
      left: 8 + Math.random() * 84,
      size: 14 + Math.random() * 16,
      color: ['#06b6d4', '#14b8a6', '#f59e0b', '#8b5cf6', '#38bdf8'][i % 5],
      delay: Math.random() * 1.5,
      duration: 2.2 + Math.random() * 1.5
    }));
  }, []);

  return (
    <>
      {/* Background Floating Stars */}
      <div className="celebration-particles-layer">
        {stars.map((star) => (
          <div
            key={star.id}
            className="floating-star"
            style={{
              top: `${star.top}%`,
              left: `${star.left}%`,
              animationDelay: `${star.delay}s`,
              animationDuration: `${star.duration}s`
            }}
          >
            <Sparkles size={star.size} color={star.color} />
          </div>
        ))}
      </div>

      {/* Main Celebration Card */}
      <div className="celebration-card celebration-card-rota">
        {/* Animated Calendar Cards Cluster */}
        <div className="rota-calendar-cluster">
          {DAYS.slice(0, 5).map((item, idx) => (
            <div
              key={item.day}
              className="rota-cal-card"
              style={{
                borderColor: item.color,
                animationDelay: `${idx * 0.1}s`
              }}
            >
              <div
                className="rota-cal-header"
                style={{
                  background: `linear-gradient(135deg, ${item.color} 0%, #1e3a8a 100%)`
                }}
              >
                {item.day}
              </div>
              <div className="rota-cal-body">
                <CheckCircle2
                  size={22}
                  color={item.color}
                  className="rota-cal-check"
                  style={{ animationDelay: `${0.3 + idx * 0.12}s` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Title and Message */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
          <Calendar size={22} color="#06b6d4" />
          <h2 className="celebration-title" style={{ margin: 0 }}>
            🎉 Weekly Rota Created Successfully!
          </h2>
        </div>

        <p className="celebration-subtitle">
          Your team's schedule is ready for the week.
        </p>

        {weekLabel && (
          <div
            className="celebration-meta-badge"
            style={{
              background: '#ecfeff',
              color: '#0e7490',
              border: '1px solid #a5f3fc'
            }}
          >
            <span>🗓️ {weekLabel}</span>
          </div>
        )}
      </div>
    </>
  );
}
