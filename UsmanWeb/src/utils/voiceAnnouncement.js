// PIXX Rota System - UsmanWeb Voice Announcements
// Speaks operation status using natural browser SpeechSynthesis.

const SETTINGS_KEY = 'pixx_usman_voice_enabled';

export function isVoiceAnnouncementEnabled() {
  try {
    const val = localStorage.getItem(SETTINGS_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function setVoiceAnnouncementEnabled(enabled) {
  try {
    localStorage.setItem(SETTINGS_KEY, String(enabled));
  } catch {
    // ignore
  }
}

export function speakAnnouncement(text) {
  if (!isVoiceAnnouncementEnabled()) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (!text || typeof text !== 'string') return;

  try {
    // If speaking, cancel to speak latest update promptly
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 0.95;
    utterance.rate = 0.95;
    utterance.lang = 'en-GB';

    // Pick best English voice if available
    const voices = window.speechSynthesis.getVoices() || [];
    const bestVoice = voices.find(v => (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Natural')) && v.lang.startsWith('en'))
      || voices.find(v => v.lang.startsWith('en'));
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[UsmanWeb Voice] Error speaking:', err);
  }
}
