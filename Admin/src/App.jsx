import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
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
    if (user.role === 'ATTENDANCE_CHECKER') {
      return <Navigate to="/attendance-checker" replace />;
    } else if (user.role === 'SALARY_DISTRIBUTOR') {
      return <Navigate to="/distributor" replace />;
    } else {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return (
    <div className="app-layout">
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'active' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="main-content">
        <Navbar setMobileOpen={setMobileOpen} />
        {children}
      </div>
    </div>
  );
}

function RoleDefaultRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'ATTENDANCE_CHECKER') return <Navigate to="/attendance-checker" replace />;
  if (user.role === 'SALARY_DISTRIBUTOR') return <Navigate to="/distributor" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
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

          {/* Weekly Rota Planner (Admin only) */}
          <Route
            path="/rota-planner"
            element={
              <ProtectedLayout allowedRoles={['ADMIN']}>
                <WeeklyRotaPlanner />
              </ProtectedLayout>
            }
          />

          {/* Attendance Checker (Sarfraz Khan & Admin) */}
          <Route
            path="/attendance-checker"
            element={
              <ProtectedLayout allowedRoles={['ATTENDANCE_CHECKER', 'ADMIN']}>
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

          {/* Reports & Exports (Admin & Sarfraz) */}
          <Route
            path="/reports"
            element={
              <ProtectedLayout allowedRoles={['ADMIN', 'ATTENDANCE_CHECKER']}>
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
    </AuthProvider>
  );
}
