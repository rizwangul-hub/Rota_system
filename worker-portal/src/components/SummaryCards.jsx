import React from 'react';
import {
  CalendarDays,
  Clock,
  Banknote,
  Wallet,
  Plane,
  Megaphone,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  MapPin,
  Calendar
} from 'lucide-react';

export default function SummaryCards({ data, onSelectCard }) {
  const {
    nextShift,
    thisWeekAttendance,
    latestFinalizedSalary,
    outstandingBalance = 0,
    leaveRequests,
    announcements
  } = data || {};

  return (
    <div className="summary-grid">
      {/* 1. Next Shift Card */}
      <div
        className="summary-card card-next-shift"
        onClick={() => onSelectCard?.('rota', 'My Weekly Rota')}
        role="button"
        tabIndex={0}
      >
        <div className="card-header">
          <div className="card-icon-wrap icon-cyan">
            <CalendarDays size={18} />
          </div>
          <span className="card-label">Next Scheduled Shift</span>
          <span className="card-arrow"><ArrowRight size={14} /></span>
        </div>

        {nextShift ? (
          <div className="shift-content">
            <div className="shift-date-row">
              <span className="shift-date-badge">{nextShift.formattedDate}</span>
              <span className="shift-hours-badge">{nextShift.scheduledHours} hrs</span>
            </div>
            <div className="shift-time">
              <Clock size={15} className="shift-inline-icon" />
              <span>{nextShift.startTime} – {nextShift.endTime}</span>
            </div>
            <div className="shift-shop">
              <MapPin size={14} className="shift-inline-icon" />
              <span>{nextShift.shopName}</span>
            </div>
          </div>
        ) : (
          <div className="empty-card-state">
            <Calendar size={22} className="empty-icon" />
            <div className="empty-title">No Upcoming Shifts</div>
            <div className="empty-sub">No assignments in published rotas yet.</div>
          </div>
        )}
      </div>

      {/* 2. This Week Attendance Card */}
      <div
        className="summary-card"
        onClick={() => onSelectCard?.('attendance', 'My Attendance')}
        role="button"
        tabIndex={0}
      >
        <div className="card-header">
          <div className="card-icon-wrap icon-emerald">
            <Clock size={18} />
          </div>
          <span className="card-label">This Week's Attendance</span>
          <span className="card-arrow"><ArrowRight size={14} /></span>
        </div>

        <div className="attendance-stats-grid">
          <div className="stat-box">
            <div className="stat-value text-emerald">
              {thisWeekAttendance?.verifiedDays || 0}
            </div>
            <div className="stat-name">Verified Days</div>
          </div>

          <div className="stat-box">
            <div className="stat-value text-primary">
              {thisWeekAttendance?.verifiedHours || 0}h
            </div>
            <div className="stat-name">Verified Hours</div>
          </div>

          <div className="stat-box">
            <div className="stat-value text-amber">
              {thisWeekAttendance?.lateArrivals || 0}
            </div>
            <div className="stat-name">Late Arrivals</div>
          </div>
        </div>

        <div className="card-footer-caption">
          {thisWeekAttendance?.weekLabel ? `Week: ${thisWeekAttendance.weekLabel}` : 'Checked shifts only'}
        </div>
      </div>

      {/* 3. Latest Finalized Salary Card */}
      <div
        className="summary-card"
        onClick={() => onSelectCard?.('salary', 'My Salary & Payslips')}
        role="button"
        tabIndex={0}
      >
        <div className="card-header">
          <div className="card-icon-wrap icon-blue">
            <Banknote size={18} />
          </div>
          <span className="card-label">Latest Finalized Payslip</span>
          <span className="card-arrow"><ArrowRight size={14} /></span>
        </div>

        {latestFinalizedSalary ? (
          <div className="salary-content">
            <div className="salary-amount-row">
              <span className="currency-symbol">£</span>
              <span className="salary-amount">
                {latestFinalizedSalary.amount?.toFixed(2)}
              </span>
              <span className={`status-pill status-${latestFinalizedSalary.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                {latestFinalizedSalary.status}
              </span>
            </div>
            <div className="salary-week-label">
              Week: {latestFinalizedSalary.weekLabel}
            </div>
            {latestFinalizedSalary.balanceRemaining > 0 && (
              <div className="salary-pending-note">
                £{latestFinalizedSalary.balanceRemaining?.toFixed(2)} remaining to pay
              </div>
            )}
          </div>
        ) : (
          <div className="empty-card-state">
            <Banknote size={22} className="empty-icon" />
            <div className="empty-title">No Finalized Payslips</div>
            <div className="empty-sub">Awaiting admin salary finalization.</div>
          </div>
        )}
      </div>

      {/* 4. Outstanding Balance Card */}
      <div
        className="summary-card"
        onClick={() => onSelectCard?.('ledger', 'My Salary Ledger')}
        role="button"
        tabIndex={0}
      >
        <div className="card-header">
          <div className="card-icon-wrap icon-purple">
            <Wallet size={18} />
          </div>
          <span className="card-label">Outstanding Balance</span>
          <span className="card-arrow"><ArrowRight size={14} /></span>
        </div>

        <div className="salary-content">
          <div className="salary-amount-row">
            <span className="currency-symbol">£</span>
            <span className="salary-amount" style={{ color: outstandingBalance > 0 ? '#a855f7' : '#94a3b8' }}>
              {outstandingBalance?.toFixed(2)}
            </span>
          </div>
          <div className="card-footer-caption">
            {outstandingBalance > 0
              ? 'Unpaid finalized salary balance'
              : 'All finalized wages settled'}
          </div>
        </div>
      </div>

      {/* 5. Leave Requests Card */}
      <div
        className="summary-card"
        onClick={() => onSelectCard?.('leaves', 'Leave Requests')}
        role="button"
        tabIndex={0}
      >
        <div className="card-header">
          <div className="card-icon-wrap icon-amber">
            <Plane size={18} />
          </div>
          <span className="card-label">Leave Requests</span>
          <span className="card-arrow"><ArrowRight size={14} /></span>
        </div>

        <div className="stat-split-row">
          <div className="split-stat">
            <div className="split-val text-amber">{leaveRequests?.pending || 0}</div>
            <div className="split-lbl">Pending Review</div>
          </div>
          <div className="split-divider" />
          <div className="split-stat">
            <div className="split-val text-emerald">{leaveRequests?.approved || 0}</div>
            <div className="split-lbl">Approved</div>
          </div>
        </div>
      </div>

      {/* 6. Announcements Card */}
      <div
        className="summary-card"
        onClick={() => onSelectCard?.('announcements', 'Company Announcements')}
        role="button"
        tabIndex={0}
      >
        <div className="card-header">
          <div className="card-icon-wrap icon-rose">
            <Megaphone size={18} />
          </div>
          <span className="card-label">Announcements</span>
          <span className="card-arrow"><ArrowRight size={14} /></span>
        </div>

        {announcements?.latest ? (
          <div className="announcement-content">
            <div className="announcement-title">{announcements.latest.title}</div>
            <div className="announcement-snippet">{announcements.latest.message}</div>
          </div>
        ) : (
          <div className="empty-card-state" style={{ padding: '10px 0' }}>
            <CheckCircle2 size={20} className="empty-icon text-emerald" />
            <div className="empty-title">All Caught Up</div>
            <div className="empty-sub">No unread notices from management.</div>
          </div>
        )}
      </div>
    </div>
  );
}
