import React, { useState, useEffect } from 'react';
import Header from './Header';
import SummaryCards from './SummaryCards';
import QuickModules from './QuickModules';
import BottomNav from './BottomNav';
import MoreDrawer from './MoreDrawer';
import PlaceholderModal from './PlaceholderModal';
import MyAttendance from './MyAttendance';
import MyRota from './MyRota';
import MySalary from './MySalary';
import api from '../services/api';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [activePage, setActivePage] = useState('home'); // 'home' | 'attendance'
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/worker/dashboard');
      if (res.data?.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load worker dashboard:', err);
      setError(
        err.response?.data?.message ||
        'Unable to connect to the Rota System server. Please check your connection.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'home') {
      setActivePage('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tabId === 'more') {
      setMoreDrawerOpen(true);
    } else if (tabId === 'attendance') {
      setActivePage('attendance');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tabId === 'rota') {
      setActivePage('rota');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tabId === 'salary') {
      setActivePage('salary');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectCard = (moduleKey, title) => {
    if (moduleKey === 'attendance') {
      setActiveTab('attendance');
      setActivePage('attendance');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (moduleKey === 'rota') {
      setActiveTab('rota');
      setActivePage('rota');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (moduleKey === 'salary' || moduleKey === 'ledger') {
      setActiveTab('salary');
      setActivePage('salary');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const badgeMap = {
      rota: 'Phase 4',
      attendance: 'Phase 3',
      salary: 'Phase 5',
      ledger: 'Phase 5',
      leaves: 'Phase 6',
      announcements: 'Phase 6'
    };

    setSelectedModule({
      id: moduleKey,
      title: title || 'Workforce Feature',
      desc: `Detailed view and workflows for ${title || 'this feature'}.`,
      badge: badgeMap[moduleKey] || 'Upcoming Phase'
    });
  };

  const handleSelectQuickModule = (mod) => {
    if (mod.id === 'profile') {
      setMoreDrawerOpen(true);
    } else if (mod.id === 'attendance') {
      setActiveTab('attendance');
      setActivePage('attendance');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (mod.id === 'rota') {
      setActiveTab('rota');
      setActivePage('rota');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (mod.id === 'salary' || mod.id === 'ledger') {
      setActiveTab('salary');
      setActivePage('salary');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setSelectedModule(mod);
    }
  };

  return (
    <div className="dashboard-app-layout">
      <div className="dashboard-content-container">
        {/* Header */}
        <Header
          worker={data?.worker}
          unreadAnnouncements={data?.announcements?.unreadCount || 0}
          onOpenProfile={() => setMoreDrawerOpen(true)}
          onOpenNotifications={() =>
            handleSelectCard('announcements', 'Company Announcements')
          }
        />

        {/* Error State */}
        {error && (
          <div className="dashboard-error-banner">
            <div className="error-icon-box">
              <WifiOff size={22} />
            </div>
            <div className="error-text-box">
              <div className="error-heading">Connection Error</div>
              <div className="error-sub">{error}</div>
            </div>
            <button
              type="button"
              className="btn-retry"
              onClick={fetchDashboardData}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && !data && (
          <div className="dashboard-loading-skeleton">
            <div className="skeleton-card" style={{ height: '140px' }} />
            <div className="skeleton-card" style={{ height: '110px' }} />
            <div className="skeleton-card" style={{ height: '110px' }} />
            <div className="skeleton-card" style={{ height: '90px' }} />
          </div>
        )}

        {/* Main Content */}
        {activePage === 'attendance' ? (
          <MyAttendance
            onBack={() => {
              setActivePage('home');
              setActiveTab('home');
              fetchDashboardData();
            }}
          />
        ) : activePage === 'rota' ? (
          <MyRota
            onBack={() => {
              setActivePage('home');
              setActiveTab('home');
              fetchDashboardData();
            }}
          />
        ) : activePage === 'salary' ? (
          <MySalary
            onBack={() => {
              setActivePage('home');
              setActiveTab('home');
              fetchDashboardData();
            }}
          />
        ) : (
          data && (
            <main className="dashboard-main-view">
              {/* Summary Cards */}
              <SummaryCards data={data} onSelectCard={handleSelectCard} />

              {/* Quick Access Modules */}
              <QuickModules onSelectModule={handleSelectQuickModule} />
            </main>
          )
        )}
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav activeTab={activeTab} onSelectTab={handleSelectTab} />

      {/* More / Account Drawer */}
      {moreDrawerOpen && (
        <MoreDrawer
          worker={data?.worker}
          onClose={() => {
            setMoreDrawerOpen(false);
            setActiveTab('home');
          }}
          onSelectModule={(mod) => setSelectedModule(mod)}
        />
      )}

      {/* Placeholder Modal for Upcoming Phases */}
      {selectedModule && (
        <PlaceholderModal
          module={selectedModule}
          onClose={() => {
            setSelectedModule(null);
            setActiveTab('home');
          }}
        />
      )}
    </div>
  );
}
