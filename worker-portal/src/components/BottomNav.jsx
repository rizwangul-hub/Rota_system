import React from 'react';
import { Home, CalendarDays, Clock, Banknote, Menu } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'rota', label: 'My Rota', icon: CalendarDays },
  { id: 'attendance', label: 'Attendance', icon: Clock },
  { id: 'salary', label: 'Salary', icon: Banknote },
  { id: 'more', label: 'More', icon: Menu }
];

export default function BottomNav({ activeTab = 'home', onSelectTab }) {
  return (
    <nav className="bottom-nav" aria-label="Mobile Bottom Navigation">
      <div className="bottom-nav-inner">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-tab-btn ${isActive ? 'nav-tab-active' : ''}`}
              onClick={() => onSelectTab(item.id)}
              aria-label={item.label}
              aria-selected={isActive}
            >
              <div className="nav-icon-container">
                <Icon size={20} />
                {isActive && <span className="nav-active-dot" />}
              </div>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
