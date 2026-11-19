import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="mobile-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="spin" style={{ width: '32px', height: '32px', border: '3px solid #0284c7', borderTopColor: 'transparent', borderRadius: '50%', marginBottom: '12px' }} />
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Verifying session...</div>
      </div>
    );
  }

  return user ? <Dashboard /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
