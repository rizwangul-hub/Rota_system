// PIXX Rota System - Voice Announcement Service (Muted for Admin Dashboard)
// All voice announcements and spoken audio are completely disabled for the Admin Dashboard as requested.

class VoiceAnnouncementService {
  constructor() {
    this.queue = [];
    this.isSpeaking = false;
    this.settings = {
      enabled: false,
      volume: 0,
      rate: 1.0,
      pitch: 1.0,
      preferredVoiceURI: null,
      language: 'en-GB'
    };
    this.voices = [];
    this.listeners = new Set();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  loadSettings() {
    return {
      enabled: false,
      volume: 0,
      rate: 1.0,
      pitch: 1.0,
      preferredVoiceURI: null,
      language: 'en-GB'
    };
  }

  saveSettings() {
    // No-op: voice is permanently disabled in Admin
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {}

  speak() {
    // Completely silent - no speech synthesis in Admin dashboard
    return Promise.resolve(false);
  }

  processQueue() {
    this.queue = [];
    this.isSpeaking = false;
  }

  stop() {
    this.queue = [];
    this.isSpeaking = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  getAvailableVoices() {
    return [];
  }
}

export const voiceAnnouncementService = new VoiceAnnouncementService();
export default voiceAnnouncementService;
