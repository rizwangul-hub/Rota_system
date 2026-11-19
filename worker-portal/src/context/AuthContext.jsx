import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('worker_token'));
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('worker_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleAuthExpired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener('worker-auth-expired', handleAuthExpired);
    return () => window.removeEventListener('worker-auth-expired', handleAuthExpired);
  }, []);

  useEffect(() => {
    const verifySession = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/worker/auth/me');
        if (res.data?.success && res.data.user) {
          setUser(res.data.user);
          localStorage.setItem('worker_user', JSON.stringify(res.data.user));
        }
      } catch (err) {
        console.warn('Worker session expired or invalid:', err.message);
        setToken(null);
        setUser(null);
        localStorage.removeItem('worker_token');
        localStorage.removeItem('worker_user');
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, [token]);

  const login = async (email, password) => {
    const res = await api.post('/worker/auth/login', { email, password });
    if (res.data?.success) {
      const newToken = res.data.token;
      const newUser = res.data.user;
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('worker_token', newToken);
      localStorage.setItem('worker_user', JSON.stringify(newUser));
      return res.data;
    }
    throw new Error(res.data?.message || 'Login failed.');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('worker_token');
    localStorage.removeItem('worker_user');
  };

  const changePassword = async (currentPassword, newPassword) => {
    const res = await api.post('/worker/auth/change-password', {
      currentPassword,
      newPassword
    });
    return res.data;
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
