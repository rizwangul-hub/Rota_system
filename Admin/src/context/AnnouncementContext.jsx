import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import voiceAnnouncementService from '../services/voiceAnnouncementService';
import { useAuth } from './AuthContext';

const AnnouncementContext = createContext(null);

export function AnnouncementProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(() => voiceAnnouncementService.settings);
  const [activeOperations, setActiveOperations] = useState({});
  const [recentNotification, setRecentNotification] = useState(null);

  // Subscribe to service setting updates
  useEffect(() => {
    const unsubscribe = voiceAnnouncementService.subscribe((newSettings) => {
      setSettings(newSettings);
    });
    return unsubscribe;
  }, []);

  const updateSettings = useCallback((newSettings) => {
    voiceAnnouncementService.saveSettings(newSettings);
  }, []);

  // Determine current user's authenticated display name
  const currentActorName = useMemo(() => {
    if (!user) return 'Staff';
    return user.name || user.username || 'Authorized User';
  }, [user]);

  // Start announcement
  const announceStart = useCallback((opId, {
    actor = currentActorName,
    label = 'Operation in progress',
    message,
    waitMessage = 'Please wait a moment.'
  } = {}) => {
    const spokenText = message || `${actor} is ${label.toLowerCase()}. ${waitMessage}`;

    setActiveOperations(prev => ({
      ...prev,
      [opId]: {
        id: opId,
        actor,
        label,
        status: 'IN_PROGRESS',
        startTime: Date.now()
      }
    }));

    setRecentNotification({
      type: 'in-progress',
      title: label,
      actor,
      message: spokenText,
      timestamp: Date.now()
    });

    voiceAnnouncementService.speak(spokenText);
  }, [currentActorName]);

  // Success announcement
  const announceSuccess = useCallback((opId, {
    actor = currentActorName,
    label = 'Operation completed',
    message
  } = {}) => {
    const spokenText = message || `${actor} has successfully completed ${label.toLowerCase()}.`;

    setActiveOperations(prev => {
      const next = { ...prev };
      delete next[opId];
      return next;
    });

    setRecentNotification({
      type: 'success',
      title: label,
      actor,
      message: spokenText,
      timestamp: Date.now()
    });

    voiceAnnouncementService.speak(spokenText);
  }, [currentActorName]);

  // Failure announcement
  const announceFailure = useCallback((opId, {
    actor = currentActorName,
    label = 'Operation',
    message,
    error
  } = {}) => {
    const spokenText = message || `${label} could not be completed. Please check the error message.`;

    setActiveOperations(prev => {
      const next = { ...prev };
      delete next[opId];
      return next;
    });

    setRecentNotification({
      type: 'error',
      title: `${label} Failed`,
      actor,
      message: spokenText,
      timestamp: Date.now()
    });

    voiceAnnouncementService.speak(spokenText);
  }, [currentActorName]);

  /**
   * Helper that executes an async operation with full start, success, and error announcements.
   * Only announces success when the promise resolves without throwing.
   */
  const runAnnouncedOperation = useCallback(async ({
    id = `op-${Date.now()}`,
    label = 'Operation',
    actor = currentActorName,
    startMessage,
    successMessage,
    errorMessage,
    action
  }) => {
    if (typeof action !== 'function') {
      throw new Error('[AnnouncementContext] action must be an async function');
    }

    announceStart(id, {
      actor,
      label,
      message: startMessage
    });

    try {
      const result = await action();
      announceSuccess(id, {
        actor,
        label,
        message: typeof successMessage === 'function' ? successMessage(result) : successMessage
      });
      return result;
    } catch (err) {
      announceFailure(id, {
        actor,
        label,
        message: typeof errorMessage === 'function' ? errorMessage(err) : errorMessage,
        error: err
      });
      throw err;
    }
  }, [currentActorName, announceStart, announceSuccess, announceFailure]);

  const testAnnouncement = useCallback((customText) => {
    const text = customText || `System announcement test for ${currentActorName}. Voice announcements are working properly.`;
    voiceAnnouncementService.speak(text);
  }, [currentActorName]);

  const value = {
    settings,
    updateSettings,
    activeOperations,
    recentNotification,
    announceStart,
    announceSuccess,
    announceFailure,
    runAnnouncedOperation,
    testAnnouncement,
    currentActorName,
    voices: voiceAnnouncementService.getAvailableVoices()
  };

  return (
    <AnnouncementContext.Provider value={value}>
      {children}
    </AnnouncementContext.Provider>
  );
}

export function useAnnouncement() {
  const context = useContext(AnnouncementContext);
  if (!context) {
    return {
      settings: { enabled: false },
      updateSettings: () => {},
      activeOperations: {},
      recentNotification: null,
      announceStart: () => {},
      announceSuccess: () => {},
      announceFailure: () => {},
      runAnnouncedOperation: async ({ action }) => (typeof action === 'function' ? action() : null),
      testAnnouncement: () => {},
      currentActorName: 'Staff',
      voices: []
    };
  }
  return context;
}
export default AnnouncementContext;
