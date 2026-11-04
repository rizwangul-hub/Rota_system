import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from './AuthContext';
import { checkUnsavedStatus } from '../utils/unsavedChangesTracker';
import UpdateNotification from '../components/updates/UpdateNotification';
import CriticalUpdateModal from '../components/updates/CriticalUpdateModal';
import UnsavedChangesModal from '../components/updates/UnsavedChangesModal';
import '../components/updates/SystemUpdates.css';

const SystemUpdateContext = createContext(null);

// Injected by Vite define at build time
const CLIENT_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev-build';
const CLIENT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.5.0';

export function SystemUpdateProvider({ children }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateType, setUpdateType] = useState('normal'); // 'normal' | 'critical'
  const [versionInfo, setVersionInfo] = useState({
    version: CLIENT_VERSION,
    buildId: CLIENT_BUILD_ID,
    title: '🚀 System Update Available!',
    message: 'We have improved the system with new features, enhancements, and bug fixes.\n\nPlease refresh the system to experience the latest improvements.',
    releaseNotes: []
  });

  const [isDismissed, setIsDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Unsaved guard dialog state
  const [unsavedModalOpen, setUnsavedModalOpen] = useState(false);
  const [unsavedReason, setUnsavedReason] = useState('');
  const [isRequestInFlight, setIsRequestInFlight] = useState(false);

  // Countdown timer for critical updates
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [isDeadlineExpired, setIsDeadlineExpired] = useState(false);

  const checkInProgressRef = useRef(false);

  // Multi-tab sync via BroadcastChannel
  const broadcastChannelRef = useRef(null);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        broadcastChannelRef.current = new BroadcastChannel('pixx_system_update');
        broadcastChannelRef.current.onmessage = (event) => {
          if (event.data?.type === 'UPDATE_DETECTED') {
            setUpdateAvailable(true);
            setUpdateType(event.data.updateType);
            setVersionInfo(event.data.versionInfo);
          } else if (event.data?.type === 'UPDATE_DISMISSED') {
            setIsDismissed(true);
          }
        };
      }
    } catch {}

    return () => {
      broadcastChannelRef.current?.close();
    };
  }, []);

  // Safe app reload
  const executeSafeRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // 1. Tell PWA service worker to activate new version immediately
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update().catch(() => {});
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }

      // 2. Prevent infinite reload loops
      const targetBuild = versionInfo.buildId || 'latest';
      sessionStorage.setItem('just_reloaded_build', targetBuild);

      // 3. Clear transient build cache if Cache API exists
      if (typeof window !== 'undefined' && 'caches' in window) {
        const keys = await caches.keys().catch(() => []);
        for (const key of keys) {
          if (key.includes('vite') || key.includes('app-cache')) {
            await caches.delete(key).catch(() => {});
          }
        }
      }
    } finally {
      // Hard reload with cache-busting parameter
      window.location.reload();
    }
  }, [versionInfo.buildId]);

  // Handle user refresh request with unsaved changes guard
  const requestRefresh = useCallback(() => {
    const status = checkUnsavedStatus();
    if (status.hasUnsaved) {
      setUnsavedReason(status.reason);
      setIsRequestInFlight(status.isRequestInFlight);
      setUnsavedModalOpen(true);
      return;
    }
    void executeSafeRefresh();
  }, [executeSafeRefresh]);

  // Main Version Check logic
  const checkForUpdates = useCallback(async () => {
    if (checkInProgressRef.current) return;
    checkInProgressRef.current = true;

    try {
      // Fetch both public /version.json and /api/version in parallel
      const timestamp = Date.now();
      const [staticRes, apiRes] = await Promise.all([
        fetch(`/version.json?t=${timestamp}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
        axios.get(`${API_BASE_URL}/version?t=${timestamp}`).then(r => r.data).catch(() => null)
      ]);

      const latestData = apiRes?.success ? apiRes : staticRes;
      if (!latestData || !latestData.buildId) return;

      const serverBuildId = latestData.buildId;
      const serverVersion = latestData.version || CLIENT_VERSION;
      const isCritical = latestData.type === 'critical';

      // Detect if server build differs from our loaded client bundle
      const isDifferentBuild = (
        CLIENT_BUILD_ID !== 'dev-build' &&
        serverBuildId !== CLIENT_BUILD_ID
      );

      // Check if Admin published an update announcement through backend
      const isManualAnnouncement = Boolean(apiRes?.success && apiRes.type);

      if (isDifferentBuild || isManualAnnouncement) {
        setUpdateAvailable(true);
        setUpdateType(isCritical ? 'critical' : 'normal');

        const info = {
          version: serverVersion,
          buildId: serverBuildId,
          type: isCritical ? 'critical' : 'normal',
          title: latestData.title || (isCritical ? '⚠️ Important System Update Required!' : '🚀 System Update Available!'),
          message: latestData.message || (isCritical
            ? 'A critical system update is available.\n\nWe have made important improvements to system security, reliability, and functionality.\n\nPlease update your system to continue using the latest version.'
            : 'We have improved the system with new features, enhancements, and bug fixes.\n\nPlease refresh the system to experience the latest improvements.'),
          releaseNotes: latestData.releaseNotes || [],
          criticalDeadline: latestData.criticalDeadline || null
        };
        setVersionInfo(info);

        // Check if user previously clicked "Later" for this exact build
        if (!isCritical) {
          const dismissedBuild = localStorage.getItem(`dismissed_update_${serverBuildId}`);
          if (dismissedBuild === 'true') {
            setIsDismissed(true);
          } else {
            setIsDismissed(false);
          }
        }

        // Broadcast to other open tabs
        broadcastChannelRef.current?.postMessage({
          type: 'UPDATE_DETECTED',
          updateType: isCritical ? 'critical' : 'normal',
          versionInfo: info
        });
      }
    } catch {
      // Silently continue polling on network hiccups
    } finally {
      checkInProgressRef.current = false;
    }
  }, []);

  // Poll for updates every 45 seconds & on tab visibility
  useEffect(() => {
    // Initial check
    void checkForUpdates();

    const interval = setInterval(checkForUpdates, 45000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdates();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [checkForUpdates]);

  // Critical Update Deadline Countdown
  useEffect(() => {
    if (!updateAvailable || updateType !== 'critical' || !versionInfo.criticalDeadline) {
      setRemainingSeconds(null);
      setIsDeadlineExpired(false);
      return;
    }

    const targetTime = new Date(versionInfo.criticalDeadline).getTime();
    if (isNaN(targetTime)) return;

    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.floor((targetTime - now) / 1000);
      if (diff <= 0) {
        setRemainingSeconds(0);
        setIsDeadlineExpired(true);
      } else {
        setRemainingSeconds(diff);
        setIsDeadlineExpired(false);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [updateAvailable, updateType, versionInfo.criticalDeadline]);

  // Gracefully handle dynamic import chunk errors after deployments
  useEffect(() => {
    const handleChunkError = (e) => {
      const msg = e?.message || e?.reason?.message || '';
      if (
        msg.includes('dynamically imported module') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module')
      ) {
        console.warn('Stale asset chunk detected after new deployment. Auto-reloading safely...');
        window.location.reload();
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);
    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
    };
  }, []);

  const handleLater = () => {
    setIsDismissed(true);
    if (versionInfo.buildId) {
      localStorage.setItem(`dismissed_update_${versionInfo.buildId}`, 'true');
    }
    broadcastChannelRef.current?.postMessage({ type: 'UPDATE_DISMISSED' });
  };

  const openUpdateDialog = () => {
    setIsDismissed(false);
  };

  return (
    <SystemUpdateContext.Provider
      value={{
        updateAvailable,
        updateType,
        versionInfo,
        clientBuildId: CLIENT_BUILD_ID,
        clientVersion: CLIENT_VERSION,
        isDismissed,
        openUpdateDialog,
        requestRefresh,
        checkForUpdates
      }}
    >
      {children}

      {/* 1. Normal Update Banner (Non-intrusive floating alert) */}
      {updateAvailable && updateType === 'normal' && !isDismissed && (
        <UpdateNotification
          show={true}
          versionInfo={versionInfo}
          onRefreshNow={requestRefresh}
          onLater={handleLater}
          refreshing={refreshing}
        />
      )}

      {/* 2. Critical Update Modal (Mandatory with deadline protection) */}
      {updateAvailable && updateType === 'critical' && (
        <CriticalUpdateModal
          show={true}
          versionInfo={versionInfo}
          onUpdateNow={requestRefresh}
          remainingSeconds={remainingSeconds}
          isExpired={isDeadlineExpired}
          refreshing={refreshing}
        />
      )}

      {/* 3. Unsaved Changes Guard Dialog */}
      <UnsavedChangesModal
        isOpen={unsavedModalOpen}
        reason={unsavedReason}
        isRequestInFlight={isRequestInFlight}
        onSaveFinish={() => setUnsavedModalOpen(false)}
        onConfirmRefresh={() => {
          setUnsavedModalOpen(false);
          void executeSafeRefresh();
        }}
        onCancel={() => setUnsavedModalOpen(false)}
      />
    </SystemUpdateContext.Provider>
  );
}

export function useSystemUpdate() {
  const context = useContext(SystemUpdateContext);
  if (!context) {
    return {
      updateAvailable: false,
      updateType: 'normal',
      clientVersion: '2.5.0',
      clientBuildId: 'dev-build',
      requestRefresh: () => window.location.reload(),
      openUpdateDialog: () => {}
    };
  }
  return context;
}
