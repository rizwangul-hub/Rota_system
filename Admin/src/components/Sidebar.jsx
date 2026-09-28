import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  CheckSquare,
  Banknote,
  Users,
  Award,
  FileBarChart,
  Settings,
  ShieldCheck,
  LogOut,
  Clock,
  CalendarDays
} from 'lucide-react';
import logo from '../assets/logo.jpg';

export default function Sidebar({ mobileOpen, setMobileOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const role = user?.role;

  return (
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div style={{ background: '#ffffff', padding: '4px', borderRadius: '8px', display: 'flex', flexShrink: 0 }}>
          <img src={logo} alt="Pixx Rota" style={{ width: '48px', height: '34px', objectFit: 'contain' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="brand-title" style={{ letterSpacing: '0.2px' }}>PIXX ROTA</div>
          <div className="brand-sub" style={{ fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Attendance • Payroll • Workforce
          </div>
        </div>
      </div>

      <ul className="nav-menu">
        {/* ADMIN Navigation */}
        {role === 'ADMIN' && (
          <>
            <li className="nav-section-title">Core Management</li>
            <li className="nav-item">
              <NavLink to="/dashboard" onClick={() => setMobileOpen(false)}>
                <LayoutDashboard size={18} /> Dashboard
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/employees" onClick={() => setMobileOpen(false)}>
                <Users size={18} /> Staff / Employees
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/rota-planner" onClick={() => setMobileOpen(false)}>
                <CalendarDays size={18} /> Weekly Rota Planner
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/settings" onClick={() => setMobileOpen(false)}>
                <Settings size={18} /> Shops & Settings
              </NavLink>
            </li>

            <li className="nav-section-title">Attendance</li>
            <li className="nav-item">
              <NavLink to="/attendance-checker" onClick={() => setMobileOpen(false)}>
                <CheckSquare size={18} /> Attendance Approval
              </NavLink>
            </li>

            <li className="nav-section-title">Payroll</li>
            <li className="nav-item">
              <NavLink to="/salaries" onClick={() => setMobileOpen(false)}>
                <Banknote size={18} /> Weekly Salaries
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/bonuses" onClick={() => setMobileOpen(false)}>
                <Award size={18} /> Commission Details
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/distributor" onClick={() => setMobileOpen(false)}>
                <Clock size={18} /> Pay Salaries
              </NavLink>
            </li>

            <li className="nav-section-title">Reports & System</li>
            <li className="nav-item">
              <NavLink to="/reports" onClick={() => setMobileOpen(false)}>
                <FileBarChart size={18} /> Reports & Exports
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/audit" onClick={() => setMobileOpen(false)}>
                <ShieldCheck size={18} /> Audit Logs
              </NavLink>
            </li>
          </>
        )}

        {/* SARFRAZ KHAN (ATTENDANCE_CHECKER) Navigation */}
        {role === 'ATTENDANCE_CHECKER' && (
          <>
            <li className="nav-section-title">Attendance Review</li>
            <li className="nav-item">
              <NavLink to="/attendance-checker" onClick={() => setMobileOpen(false)}>
                <CheckSquare size={18} /> Pending Attendance
              </NavLink>
            </li>
            <li className="nav-section-title">Reports</li>
            <li className="nav-item">
              <NavLink to="/reports" onClick={() => setMobileOpen(false)}>
                <FileBarChart size={18} /> WhatsApp Daily Report
              </NavLink>
            </li>
          </>
        )}

        {/* SALARY DISTRIBUTOR Navigation */}
        {role === 'SALARY_DISTRIBUTOR' && (
          <>
            <li className="nav-section-title">Disbursement</li>
            <li className="nav-item">
              <NavLink to="/distributor" onClick={() => setMobileOpen(false)}>
                <Banknote size={18} /> Pay Salaries
              </NavLink>
            </li>
          </>
        )}
      </ul>

      {/* User Footer */}
      <div style={{ padding: '16px', borderTop: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0, paddingRight: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'capitalize' }}>
              {user?.role?.replace('_', ' ').toLowerCase()}
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: '#1e293b',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Log Out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
