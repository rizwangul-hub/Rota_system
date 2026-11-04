import React, { useState, useEffect, useMemo } from 'react';
import { Coins, Sparkles, TrendingUp } from 'lucide-react';

export default function PayrollCelebration({ totalAmount, employeeCount }) {
  // Smooth number counter for total payroll amount
  const [displayedAmount, setDisplayedAmount] = useState(0);

  const numericTarget = useMemo(() => {
    if (typeof totalAmount === 'number') return totalAmount;
    if (typeof totalAmount === 'string') {
      const clean = parseFloat(totalAmount.replace(/[^0-9.-]+/g, ''));
      return isNaN(clean) ? 0 : clean;
    }
    return 0;
  }, [totalAmount]);

  useEffect(() => {
    if (!numericTarget || numericTarget <= 0) return;

    let start = 0;
    const duration = 1200; // 1.2s counter animation
    const startTime = performance.now();

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = start + (numericTarget - start) * ease;
      setDisplayedAmount(current);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    const animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [numericTarget]);

  // Floating background coins
  const floatingCoins = useMemo(() => {
    return Array.from({ length: 9 }).map((_, i) => ({
      id: i,
      left: 6 + (i * 11 + Math.random() * 4) % 88,
      size: 28 + Math.floor(Math.random() * 22),
      duration: 3 + Math.random() * 2.5,
      delay: Math.random() * 1.4
    }));
  }, []);

  return (
    <>
      {/* Background Floating Golden Coins */}
      <div className="celebration-particles-layer">
        {floatingCoins.map((coin) => (
          <div
            key={coin.id}
            className="bg-floating-coin"
            style={{
              left: `${coin.left}%`,
              width: `${coin.size}px`,
              height: `${coin.size}px`,
              fontSize: `${Math.floor(coin.size * 0.45)}px`,
              animationDuration: `${coin.duration}s`,
              animationDelay: `${coin.delay}s`
            }}
          >
            £
          </div>
        ))}
      </div>

      {/* Main Celebration Card */}
      <div className="celebration-card celebration-card-payroll">
        {/* Golden Coins Cluster */}
        <div className="payroll-coins-cluster">
          <div className="gold-coin" style={{ animationDelay: '0.2s', width: '44px', height: '44px', fontSize: '18px' }}>
            £
          </div>
          <div className="gold-coin" style={{ width: '58px', height: '58px', fontSize: '26px' }}>
            £
          </div>
          <div className="gold-coin" style={{ animationDelay: '0.4s', width: '44px', height: '44px', fontSize: '18px' }}>
            £
          </div>
        </div>

        {/* Title and Message */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
          <Coins size={22} color="#059669" />
          <h2 className="celebration-title" style={{ margin: 0 }}>
            💰 Weekly Payroll Generated Successfully!
          </h2>
        </div>

        <p className="celebration-subtitle">
          Your team's weekly salary calculation is complete.
        </p>

        {/* Counter if actual total amount is provided */}
        {numericTarget > 0 ? (
          <div
            style={{
              background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
              border: '1.5px solid #a7f3d0',
              borderRadius: '16px',
              padding: '14px 20px',
              marginTop: '12px',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)'
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Payroll
            </div>
            <div className="payroll-amount-counter" style={{ marginTop: '2px' }}>
              £{displayedAmount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        ) : null}

        {/* Employee count badge */}
        {employeeCount > 0 && (
          <div
            className="celebration-meta-badge"
            style={{
              background: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fde68a'
            }}
          >
            <TrendingUp size={14} />
            <span>{employeeCount} Staff Salaries Processed</span>
          </div>
        )}
      </div>
    </>
  );
}
