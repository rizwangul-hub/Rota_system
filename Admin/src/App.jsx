import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LayoutProvider, useLayout } from './context/LayoutContext';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';

// Pages
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import SarfrazAttendance from './pages/SarfrazAttendance';
import WeeklySalaryPage from './pages/WeeklySalaryPage';
import SalaryDistributor from './pages/SalaryDistributor';
import Employees from './pages/Employees';
import EmployeeDetail from './pages/EmployeeDetail';
import BonusPage from './pages/BonusPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import AuditPage from './pages/AuditPage';
import WeeklyRotaPlanner from './pages/WeeklyRotaPlanner';

function ProtectedLayout({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  const { hideNavbar, hideSidebar, toggleNavbar, toggleSidebar } = useLayout();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Authenticating session...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to permitted landing screen
    if (user.role === 'ATTENDANCE_CHECKER' || user.role === 'ATTENDANCE_OPERATOR') {
      return <Navigate to="/attendance-checker" replace />;
    } else if (user.role === 'SALARY_DISTRIBUTOR') {
      return <Navigate to="/distributor" replace />;
    } else {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return (
    <div className={`app-layout ${hideSidebar ? 'sidebar-hidden' : ''} ${hideNavbar ? 'navbar-hidden' : ''}`}>
      {!hideSidebar && (
        <>
          <div
            className={`sidebar-backdrop ${mobileOpen ? 'active' : ''}`}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        </>
      )}
      <div className="main-content">
        {!hideNavbar ? (
          <Navbar setMobileOpen={setMobileOpen} />
        ) : (
          /* Sleek Restore Bar when Navbar is hidden */
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 16px',
            background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 100%)',
            borderBottom: '1px solid #334155',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.4px' }}>
                PIXX ROTA
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>• Top Navbar Hidden</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={toggleNavbar}
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  color: '#38bdf8',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title="Show top navigation bar"
              >
                🔽 Show Navbar
              </button>

              {hideSidebar && (
                <button
                  type="button"
                  onClick={toggleSidebar}
                  style={{
                    background: 'rgba(255, 255, 255, 0.12)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  title="Show left sidebar menu"
                >
                  ▶ Show Sidebar
                </button>
              )}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function RoleDefaultRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'ATTENDANCE_CHECKER' || user.role === 'ATTENDANCE_OPERATOR') return <Navigate to="/attendance-checker" replace />;
  if (user.role === 'SALARY_DISTRIBUTOR') return <Navigate to="/distributor" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <LayoutProvider>
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={<Login />} />

          {/* Admin Dashboard */}
          <Route
            path="/dashboard"
            element={
              <ProtectedLayout allowedRoles={['ADMIN']}>
                <AdminDashboard />
              </ProtectedLayout>
            }
          />

          {/* Weekly Rota Planner */}
          <Route
            path="/rota-planner"
            element={
              <ProtectedLayout allowedRoles={['ADMIN', 'ATTENDANCE_CHECKER', 'ATTENDANCE_OPERATOR']}>
                <WeeklyRotaPlanner />
              </ProtectedLayout>
            }
          />

          {/* Attendance Checker & Review */}
          <Route
            path="/attendance-checker"
            element={
              <ProtectedLayout allowedRoles={['ATTENDANCE_CHECKER', 'ATTENDANCE_OPERATOR', 'ADMIN']}>
                <SarfrazAttendance />
              </ProtectedLayout>
            }
          />

          {/* Weekly Salaries (Admin) */}
          <Route
            path="/salaries"
            element={
              <ProtectedLayout allowedRoles={['ADMIN']}>
                <WeeklySalaryPage />
              </ProtectedLayout>
            }
          />

          {/* Salary Distributor (Distributor & Admin) */}
          <Route
            path="/distributor"
            element={
              <ProtectedLayout allowedRoles={['SALARY_DISTRIBUTOR', 'ADMIN']}>
                <SalaryDistributor />
              </ProtectedLayout>
            }
          />

          {/* Employee Directory & Profile (Admin) */}
          <Route
            path="/employees"
            element={
              <ProtectedLayout allowedRoles={['ADMIN']}>
                <Employees />
              </ProtectedLayout>
            }
          />
          <Route
            path="/employees/:id"
            element={
              <ProtectedLayout allowedRoles={['ADMIN']}>
                <EmployeeDetail />
              </ProtectedLayout>
            }
          />

          {/* Commission Details (Admin) */}
          <Route
            path="/bonuses"
            element={
              <ProtectedLayout allowedRoles={['ADMIN']}>
                <BonusPage />
              </ProtectedLayout>
            }
          />

          {/* Reports & Exports (Admin, Sarfraz, Adeel, Usman) */}
          <Route
            path="/reports"
            element={
              <ProtectedLayout allowedRoles={['ADMIN', 'ATTENDANCE_CHECKER', 'ATTENDANCE_OPERATOR']}>
                <ReportsPage />
              </ProtectedLayout>
            }
          />

          {/* Shop Settings & Schedules (Admin) */}
          <Route
            path="/settings"
            element={
              <ProtectedLayout allowedRoles={['ADMIN']}>
                <SettingsPage />
              </ProtectedLayout>
            }
          />

          {/* Audit Logs (Admin) */}
          <Route
            path="/audit"
            element={
              <ProtectedLayout allowedRoles={['ADMIN']}>
                <AuditPage />
              </ProtectedLayout>
            }
          />

          {/* Default Route */}
          <Route path="*" element={<RoleDefaultRedirect />} />
        </Routes>
      </BrowserRouter>
      </LayoutProvider>
    </AuthProvider>
  );
}
