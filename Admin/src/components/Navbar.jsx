import React from 'react';
import { Menu, LogOut, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';

const ROUTE_TITLES = {
  '/dashboard': { title: 'Executive Dashboard', parent: 'Core', parentPath: '/dashboard' },
  '/employees': { title: 'Staff Directory', parent: 'Core', parentPath: '/dashboard' },
  '/settings': { title: 'Shop Settings & Schedules', parent: 'Core', parentPath: '/dashboard' },
  '/attendance-checker': { title: 'Attendance Approval', parent: 'Attendance', parentPath: '/attendance-checker' },
  '/salaries': { title: 'Weekly Salaries', parent: 'Payroll', parentPath: '/salaries' },
  '/bonuses': { title: 'Sales Commission', parent: 'Payroll', parentPath: '/salaries' },
  '/distributor': { title: 'Salary Disbursement', parent: 'Payroll', parentPath: '/distributor' },
  '/reports': { title: 'Reports & Analytics', parent: 'System', parentPath: '/reports' },
  '/audit': { title: 'Audit Trail', parent: 'System', parentPath: '/audit' }
};

export default function Navbar({ setMobileOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentRouteInfo = ROUTE_TITLES[location.pathname] || {
    title: location.pathname.startsWith('/employees/') ? 'Employee Profile' : 'PIXX ROTA',
    parent: 'Staff',
    parentPath: '/employees'
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'ADMIN':
        return <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe' }}>Administrator</span>;
      case 'ATTENDANCE_CHECKER':
        return <span className="badge badge-checked">Attendance Checker</span>;
      case 'SALARY_DISTRIBUTOR':
        return <span className="badge badge-paid">Salary Distributor</span>;
      default:
        return <span className="badge badge-pending">{role}</span>;
    }
  };

  return (
    <header className="top-navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
        <button
          onClick={() => setMobileOpen(prev => !prev)}
          className="btn btn-outline btn-sm"
          style={{ padding: '6px 8px', border: '1px solid #cbd5e1' }}
          aria-label="Toggle navigation menu"
        >
          <Menu size={18} color="#334155" />
        </button>

        {/* Breadcrumb & Current Title */}
        <div style={{ minWidth: 0 }}>
          <div className="breadcrumbs" style={{ margin: 0 }}>
            <Link to={currentRouteInfo.parentPath}>{currentRouteInfo.parent}</Link>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentRouteInfo.title}
            </span>
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentRouteInfo.title}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {user && getRoleBadge(user.role)}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '4px 10px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
          <UserCircle size={18} color="#64748b" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
            {user?.name}
          </span>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              marginLeft: '4px'
            }}
            title="Log Out"
            aria-label="Log Out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}

