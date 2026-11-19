import React from 'react';
import { Bell, User, Building2 } from 'lucide-react';

function getGreeting(name) {
  const hour = new Date().getHours();
  let timeGreeting = 'Hello';
  if (hour >= 5 && hour < 12) timeGreeting = 'Good Morning';
  else if (hour >= 12 && hour < 17) timeGreeting = 'Good Afternoon';
  else if (hour >= 17 && hour < 22) timeGreeting = 'Good Evening';
  else timeGreeting = 'Good Night';

  return `${timeGreeting}, ${name || 'Worker'}!`;
}

export default function Header({ worker, unreadAnnouncements = 0, onOpenProfile, onOpenNotifications }) {
  const displayName = worker?.preferredName || worker?.name?.split(' ')[0] || 'Worker';
  const employeeId = worker?.employeeId || 'PIXX---';
  const shopName = worker?.assignedShop?.name || 'Pixx Retail';

  const initials = worker?.name
    ? worker.name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'W';

  return (
    <header className="app-header">
      {/* Brand & Action Row */}
      <div className="header-top">
        <div className="header-brand">
          <div className="brand-logo-wrap">
            <img src="/logo.jpg" alt="Pixx Logo" className="brand-logo-img" />
          </div>
          <div>
            <div className="brand-title">PIXX ROTA</div>
            <div className="brand-tagline">Worker Portal</div>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="header-icon-btn"
            onClick={onOpenNotifications}
            title="Announcements & Notifications"
            aria-label="Announcements & Notifications"
          >
            <Bell size={19} />
            {unreadAnnouncements > 0 && (
              <span className="notification-badge">{unreadAnnouncements}</span>
            )}
          </button>

          <button
            type="button"
            className="avatar-btn"
            onClick={onOpenProfile}
            title="Worker Profile"
            aria-label="Worker Profile"
          >
            <span className="avatar-text">{initials}</span>
          </button>
        </div>
      </div>

      {/* Personalized Greeting */}
      <div className="header-greeting">
        <h1 className="greeting-text">{getGreeting(displayName)}</h1>
        <div className="greeting-meta">
          <span className="badge-id-code">{employeeId}</span>
          <span className="meta-separator">•</span>
          <span className="meta-shop">
            <Building2 size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
            {shopName}
          </span>
        </div>
      </div>
    </header>
  );
}
