import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Menu, LogOut, UserCircle, ShieldAlert, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth, API_BASE_URL } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';

const ROUTE_TITLES = {
  '/dashboard': { title: 'Executive Dashboard', parent: 'Core', parentPath: '/dashboard' },
  '/employees': { title: 'Staff Directory', parent: 'Core', parentPath: '/dashboard' },
  '/settings': { title: 'Shop Settings & Schedules', parent: 'Core', parentPath: '/dashboard' },
  '/rota-planner': { title: 'Weekly Rota Planner', parent: 'Core', parentPath: '/dashboard' },
  '/attendance-checker': { title: 'Attendance Approval', parent: 'Attendance', parentPath: '/attendance-checker' },
  '/salaries': { title: 'Weekly Salaries', parent: 'Payroll', parentPath: '/salaries' },
  '/bonuses': { title: 'Sales Commission', parent: 'Payroll', parentPath: '/salaries' },
  '/distributor': { title: "Arsalan's Dashboard", parent: 'Payroll', parentPath: '/distributor' },
  '/reports': { title: 'Reports & Analytics', parent: 'System', parentPath: '/reports' },
  '/audit': { title: 'Audit Trail', parent: 'System', parentPath: '/audit' }
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const { sidebarCollapsed, toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const [complianceCounts, setComplianceCounts] = useState({ total: 0, expired: 0, urgent: 0 });

  useEffect(() => {
    let isSubscribed = true;
    const checkCompliance = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/employees/compliance/expiring-documents`);
        if (isSubscribed && res.data?.counts) {
          setComplianceCounts(res.data.counts);
        }
      } catch (err) {
        // silently ignore network issues
      }
    };
    checkCompliance();
    const timer = setInterval(checkCompliance, 60000); // Check once per minute
    return () => {
      isSubscribed = false;
      clearInterval(timer);
    };
  }, [location.pathname]);

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
        return <span className="badge badge-paid">Salary Distributor (Arsalan)</span>;
      default:
        return <span className="badge badge-pending">{role}</span>;
    }
  };

  return (
    <header className="top-navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
        <button
          onClick={toggleSidebar}
          className="btn btn-sm sidebar-toggle-btn"
          style={{
            padding: '7px 12px',
            border: sidebarCollapsed ? '1.5px solid #1d4ed8' : '1.5px solid #cbd5e1',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            background: sidebarCollapsed ? '#2563eb' : '#ffffff',
            color: sidebarCollapsed ? '#ffffff' : '#334155',
            fontWeight: 700,
            borderRadius: '8px',
            flexShrink: 0,
            boxShadow: sidebarCollapsed ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
            cursor: 'pointer'
          }}
          title={sidebarCollapsed ? 'Show navigation sidebar' : 'Hide navigation sidebar for wider view'}
          aria-label={sidebarCollapsed ? 'Show navigation sidebar' : 'Hide navigation sidebar'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} color="#ffffff" /> : <PanelLeftClose size={18} color="#334155" />}
          <span className="sidebar-toggle-text" style={{ fontSize: '13px' }}>
            {sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
          </span>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {complianceCounts.total > 0 && (
          <Link
            to="/employees"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: complianceCounts.expired > 0 ? '#fee2e2' : complianceCounts.urgent > 0 ? '#ffedd5' : '#fef3c7',
              border: `1px solid ${complianceCounts.expired > 0 ? '#f87171' : complianceCounts.urgent > 0 ? '#fb923c' : '#fcd34d'}`,
              color: complianceCounts.expired > 0 ? '#991b1b' : complianceCounts.urgent > 0 ? '#9a3412' : '#92400e',
              fontSize: '12px',
              fontWeight: 700,
              textDecoration: 'none',
              cursor: 'pointer'
            }}
            title={`${complianceCounts.total} employee document(s) expiring or expired. Click to review staff compliance.`}
          >
            <ShieldAlert size={14} color={complianceCounts.expired > 0 ? '#dc2626' : complianceCounts.urgent > 0 ? '#ea580c' : '#d97706'} />
            <span>{complianceCounts.total} Compliance Alert{complianceCounts.total === 1 ? '' : 's'}</span>
          </Link>
        )}
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
