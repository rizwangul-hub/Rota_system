// PIXX Rota System - System-Wide Voice Announcement Service
// Provides professional, queued, spoken status announcements for long-running operations.

const SETTINGS_KEY = 'pixx_voice_announcements_settings';

const DEFAULT_SETTINGS = {
  enabled: true,
  volume: 0.95,
  rate: 0.95,
  pitch: 1.0,
  preferredVoiceURI: null,
  language: 'en-GB'
};

// Phonetic map for natural pronunciation of proper names & technical terms
const PRONUNCIATION_MAP = [
  { match: /\bPIXX\b/gi, speak: 'Pix' },
  { match: /\bROTA\b/gi, speak: 'Roh-tah' },
  { match: /\bPDF\b/gi, speak: 'P-D-F' },
  { match: /\bxlsx\b/gi, speak: 'Excel file' },
  { match: /\bcsv\b/gi, speak: 'C-S-V' },
  { match: /\bRBAC\b/gi, speak: 'Role Based Access' },
  { match: /\bEdgware\b/gi, speak: 'Edj-ware' }
];

class VoiceAnnouncementService {
  constructor() {
    this.queue = [];
    this.isSpeaking = false;
    this.isAudioUnlocked = false;
    this.settings = this.loadSettings();
    this.voices = [];
    this.listeners = new Set();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.initVoices();
      this.initAudioUnlock();
    }
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('[VoiceAnnouncement] Failed to parse stored settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      // storage unavailable
    }
    this.notifyListeners();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.settings);
      } catch (err) {
        // ignore
      }
    }
  }

  initVoices() {
    if (!('speechSynthesis' in window)) return;
    const updateVoices = () => {
      this.voices = window.speechSynthesis.getVoices() || [];
    };
    updateVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }

  initAudioUnlock() {
    const unlock = () => {
      this.isAudioUnlocked = true;
      // Perform a tiny silent utterance on first user interaction to satisfy browser autoplay policy
      try {
        if ('speechSynthesis' in window) {
          const silentUtterance = new SpeechSynthesisUtterance(' ');
          silentUtterance.volume = 0;
          silentUtterance.rate = 1.0;
          window.speechSynthesis.speak(silentUtterance);
        }
      } catch (err) {
        // ignore
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('click', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
  }

  normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    let normalized = text.trim();
    for (const rule of PRONUNCIATION_MAP) {
      normalized = normalized.replace(rule.match, rule.speak);
    }
    return normalized;
  }

  getBestVoice() {
    if (!this.voices || this.voices.length === 0) {
      if ('speechSynthesis' in window) {
        this.voices = window.speechSynthesis.getVoices() || [];
      }
    }

    if (this.settings.preferredVoiceURI) {
      const preferred = this.voices.find(v => v.voiceURI === this.settings.preferredVoiceURI);
      if (preferred) return preferred;
    }

    // High quality natural English voices (UK / US)
    const naturalKeywords = ['Google', 'Natural', 'Samantha', 'Daniel', 'Karen', 'Moira', 'Arthur', 'David', 'Zira', 'Microsoft'];
    for (const keyword of naturalKeywords) {
      const match = this.voices.find(v => v.name.includes(keyword) && v.lang.startsWith('en'));
      if (match) return match;
    }

    // Fallback to any English voice
    const anyEn = this.voices.find(v => v.lang.startsWith('en'));
    if (anyEn) return anyEn;

    return this.voices[0] || null;
  }

  speak(text, options = {}) {
    if (!this.settings.enabled) {
      return Promise.resolve(false);
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return Promise.resolve(false);
    }

    const cleanText = this.normalizeText(text);
    if (!cleanText) return Promise.resolve(false);

    // Dedup: if the same phrase is already queued in the last 2 items, skip to prevent double-speech
    const isDuplicate = this.queue.some(item => item.text.toLowerCase() === cleanText.toLowerCase());
    if (isDuplicate) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      this.queue.push({
        text: cleanText,
        options,
        resolve
      });
      this.processQueue();
    });
  }

  processQueue() {
    if (this.isSpeaking || this.queue.length === 0) return;

    const item = this.queue.shift();
    if (!item) return;

    this.isSpeaking = true;

    try {
      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.volume = typeof item.options.volume === 'number' ? item.options.volume : this.settings.volume;
      utterance.rate = typeof item.options.rate === 'number' ? item.options.rate : this.settings.rate;
      utterance.pitch = typeof item.options.pitch === 'number' ? item.options.pitch : this.settings.pitch;

      const voice = this.getBestVoice();
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || 'en-GB';
      }

      utterance.onend = () => {
        this.isSpeaking = false;
        item.resolve(true);
        // Small 250ms breathing gap between announcements
        setTimeout(() => this.processQueue(), 250);
      };

      utterance.onerror = (e) => {
        console.warn('[VoiceAnnouncement] Speech error:', e);
        this.isSpeaking = false;
        item.resolve(false);
        setTimeout(() => this.processQueue(), 150);
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[VoiceAnnouncement] SpeechSynthesis invocation failed:', err);
      this.isSpeaking = false;
      item.resolve(false);
      this.processQueue();
    }
  }

  stop() {
    this.queue = [];
    this.isSpeaking = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  getAvailableVoices() {
    if (!this.voices || this.voices.length === 0) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this.voices = window.speechSynthesis.getVoices() || [];
      }
    }
    return this.voices;
  }
}

export const voiceAnnouncementService = new VoiceAnnouncementService();
export default voiceAnnouncementService;
