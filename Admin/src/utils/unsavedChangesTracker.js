/**
 * Unsaved Changes & Active Request Tracker
 * Protects financial and attendance records from accidental data loss during system updates.
 */

let activeApiRequestsCount = 0;
const registeredDirtyComponents = new Map();

/**
 * Hook into axios to track in-flight requests globally
 */
export function registerAxiosTracker(axiosInstance) {
  if (!axiosInstance || axiosInstance.__trackerRegistered) return;
  axiosInstance.__trackerRegistered = true;

  axiosInstance.interceptors.request.use(
    (config) => {
      // Do not count background version check polls as active user operations
      const isVersionPoll = config.url && (config.url.includes('/version') || config.url.includes('version.json'));
      if (!isVersionPoll) {
        activeApiRequestsCount++;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
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

/**
 * Check if the user is currently editing an active form control
 */
function isUserActivelyTyping() {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    // If input has text or user is focused, consider it potentially unsaved
    return true;
  }
  return false;
}

/**
 * Register a dirty state from any page or component
 * @param {string} id - Unique identifier (e.g., 'weekly-rota-cells')
 * @param {boolean} isDirty - Whether component has unsaved edits
 * @param {string} description - Human-readable label (e.g., 'Weekly Rota Schedule Edits')
 */
export function setComponentDirty(id, isDirty, description = 'Unsaved Form Data') {
  if (isDirty) {
    registeredDirtyComponents.set(id, description);
  } else {
    registeredDirtyComponents.delete(id);
  }
}

/**
 * Check whether it is safe to refresh or if unsaved changes exist
 */
export function checkUnsavedStatus() {
  const isRequestInFlight = activeApiRequestsCount > 0;
  const isTyping = isUserActivelyTyping();
  const registeredDirty = registeredDirtyComponents.size > 0;
  const globalFlag = typeof window !== 'undefined' && Boolean(window.__HAS_UNSAVED_CHANGES__);

  const hasUnsaved = isRequestInFlight || isTyping || registeredDirty || globalFlag;

  let reason = '';
  if (isRequestInFlight) {
    reason = 'A server transaction or submission is currently processing.';
  } else if (registeredDirty) {
    const list = Array.from(registeredDirtyComponents.values()).join(', ');
    reason = `You have unsaved changes in: ${list}.`;
  } else if (isTyping) {
    reason = 'You are currently filling out or editing a form input.';
  } else if (globalFlag) {
    reason = 'You have unsaved records in this view.';
  }

  return {
    hasUnsaved,
    isRequestInFlight,
    reason,
    activeRequestsCount: activeApiRequestsCount
  };
}

// Global browser beforeunload guard
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
