import React from 'react';
import {
  CalendarClock,
  CalendarDays,
  Banknote,
  Receipt,
  Palmtree,
  QrCode,
  Megaphone,
  UserCircle2,
  HelpCircle,
  ChevronRight
} from 'lucide-react';

const MODULES = [
  {
    id: 'attendance',
    title: 'My Attendance',
    desc: 'Verified shifts, hours & correction requests',
    icon: CalendarClock,
    color: '#10b981',
    badge: 'Phase 3'
  },
  {
    id: 'rota',
    title: 'My Weekly Rota',
    desc: 'Published schedule & shift confirmation',
    icon: CalendarDays,
    color: '#0284c7',
    badge: 'Phase 4'
  },
  {
    id: 'salary',
    title: 'My Salary & Payslips',
    desc: 'Finalized payslips & official PDF downloads',
    icon: Banknote,
    color: '#3b82f6',
    badge: 'Phase 5'
  },
  {
    id: 'ledger',
    title: 'My Salary Ledger',
    desc: 'Payment receipts & running balance history',
    icon: Receipt,
    color: '#8b5cf6',
    badge: 'Phase 5'
  },
  {
    id: 'leaves',
    title: 'Leave Requests',
    desc: 'Submit holiday, sick or emergency leave',
    icon: Palmtree,
    color: '#f59e0b',
    badge: 'Phase 6'
  },
  {
    id: 'digital-card',
    title: 'Digital Employee Pass',
    desc: 'Verified worker ID card with secure QR code',
    icon: QrCode,
    color: '#06b6d4',
    badge: 'Phase 6'
  },
  {
    id: 'announcements',
    title: 'Announcements',
    desc: 'Company notices & management updates',
    icon: Megaphone,
    color: '#ec4899',
    badge: 'Phase 6'
  },
  {
    id: 'profile',
    title: 'My Profile',
    desc: 'Personal details, branch & password settings',
    icon: UserCircle2,
    color: '#64748b',
    badge: 'Active'
  },
  {
    id: 'support',
    title: 'Help & Support',
    desc: 'Submit a ticket or salary query',
    icon: HelpCircle,
    color: '#14b8a6',
    badge: 'Phase 6'
  }
];

export default function QuickModules({ onSelectModule }) {
  return (
    <div className="quick-modules-section">
      <div className="section-header">
        <h2 className="section-title">Quick Access</h2>
        <span className="section-subtitle">Workforce Modules</span>
      </div>

      <div className="modules-grid">
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <div
              key={mod.id}
              className="module-card"
              onClick={() => onSelectModule(mod)}
              role="button"
              tabIndex={0}
            >
              <div
                className="module-icon-wrap"
                style={{ backgroundColor: `${mod.color}1a`, color: mod.color }}
              >
                <Icon size={22} />
              </div>

              <div className="module-info">
                <div className="module-title-row">
                  <span className="module-title">{mod.title}</span>
                  <span
                    className={`module-badge ${
                      mod.badge === 'Active' ? 'badge-active' : 'badge-upcoming'
                    }`}
                  >
                    {mod.badge}
                  </span>
                </div>
                <div className="module-desc">{mod.desc}</div>
              </div>

              <div className="module-chevron">
                <ChevronRight size={16} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
