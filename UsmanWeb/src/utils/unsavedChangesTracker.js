/**
 * Unsaved Changes & Active Request Tracker for UsmanWeb
 */

let activeApiRequestsCount = 0;
const registeredDirtyComponents = new Map();

export function registerAxiosTracker(axiosInstance) {
  if (!axiosInstance || axiosInstance.__trackerRegistered) return;
  axiosInstance.__trackerRegistered = true;

  axiosInstance.interceptors.request.use(
    (config) => {
      const isVersionPoll = config.url && (config.url.includes('/version') || config.url.includes('version.json'));
      if (!isVersionPoll) {
        activeApiRequestsCount++;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  axiosInstance.interceptors.response.use(
    (response) => {
      const isVersionPoll = response.config?.url && (response.config.url.includes('/version') || response.config.url.includes('version.json'));
      if (!isVersionPoll && activeApiRequestsCount > 0) {
        activeApiRequestsCount--;
      }
      return response;
    },
    (error) => {
      const isVersionPoll = error.config?.url && (error.config.url.includes('/version') || error.config.url.includes('version.json'));
      if (!isVersionPoll && activeApiRequestsCount > 0) {
        activeApiRequestsCount--;
      }
      return Promise.reject(error);
    }
  );
}

function isUserActivelyTyping() {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function setComponentDirty(id, isDirty, description = 'Unsaved Attendance Edits') {
  if (isDirty) {
    registeredDirtyComponents.set(id, description);
  } else {
    registeredDirtyComponents.delete(id);
  }
}

export function checkUnsavedStatus() {
  const isRequestInFlight = activeApiRequestsCount > 0;
  const isTyping = isUserActivelyTyping();
  const registeredDirty = registeredDirtyComponents.size > 0;
  const globalFlag = typeof window !== 'undefined' && Boolean(window.__HAS_UNSAVED_CHANGES__);

  const hasUnsaved = isRequestInFlight || isTyping || registeredDirty || globalFlag;

  let reason = '';
  if (isRequestInFlight) {
    reason = 'An attendance submission or operation is currently processing.';
  } else if (registeredDirty) {
    const list = Array.from(registeredDirtyComponents.values()).join(', ');
    reason = `You have unsaved changes in: ${list}.`;
  } else if (isTyping) {
    reason = 'You are currently entering time or worker details.';
  } else if (globalFlag) {
    reason = 'You have unsaved worker records.';
  }

  return {
    hasUnsaved,
    isRequestInFlight,
    reason,
    activeRequestsCount: activeApiRequestsCount
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    const status = checkUnsavedStatus();
    if (status.hasUnsaved && !status.isRequestInFlight) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    }
  });
}
