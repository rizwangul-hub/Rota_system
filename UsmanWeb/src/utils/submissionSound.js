/**
 * PIXX Rota System - UsmanWeb Attendance Submission Sound & Fireworks
 *
 * Sequence:
 * 1. 0.0s - 0.35s: Firework rocket launch whoosh (Fzzzz-WHOOSH!)
 * 2. 0.35s - 0.8s: Firework explosion (💥 BOOM! Crackle & pop!)
 * 3. 0.45s - 2.6s: TAALIYON KI AAWAZ (CLAPPING / APPLAUSE & CHEERS)
 *
 * Guarantees:
 * - Plays at 100% full volume.
 * - Dual engine: HTMLAudioElement playing high-fidelity WAV + Web Audio API synthesis.
 * - Guaranteed single play per submission (debounced).
 */

import celebrationSoundAsset from '../assets/attendance-success.wav';

let sharedAudioCtx = null;
let lastPlayTimestamp = 0;
const PLAY_DEBOUNCE_MS = 2800;

// Pre-create and preload audio element with full volume
let preloadedAudio = null;
try {
  if (typeof window !== 'undefined') {
    preloadedAudio = new Audio(celebrationSoundAsset);
    preloadedAudio.volume = 1.0;
    preloadedAudio.preload = 'auto';
  }
} catch (err) {
  // Non-blocking
}

/**
 * Prime / unlock audio on user interaction.
 * Called immediately when Usman clicks "Submit Attendance to Sarfraz".
 */
export function unlockAudioContext() {
  try {
    if (typeof window === 'undefined') return;

    if (preloadedAudio) {
      preloadedAudio.load();
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        sharedAudioCtx = new AudioCtx();
      }
      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
      }
    }
  } catch (err) {
    // Non-blocking
  }
}

/**
 * Synthesizes:
 * 1. Firework rocket launch whoosh (0s - 0.35s)
 * 2. Firework explosion BOOM (0.35s - 0.85s)
 * 3. Taaliyon ki aawaz (Energetic hand claps & applause) (0.45s - 2.5s)
 */
function playWebAudioSynthesized(ctx) {
  try {
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);
    masterGain.connect(ctx.destination);

    // Buffer for noise (used in whoosh, explosion, and hand claps)
    const bufferSize = Math.floor(ctx.sampleRate * 2.8);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      output[i] = (b0 + b1 + b2 + white * 0.1848) * 0.35;
    }

    // --- 1. FIREWORK ROCKET LAUNCH WHOOSH (0s -> 0.35s) ---
    const whooshSource = ctx.createBufferSource();
    whooshSource.buffer = noiseBuffer;
    const whooshFilter = ctx.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.frequency.setValueAtTime(250, now);
    whooshFilter.frequency.exponentialRampToValueAtTime(1400, now + 0.34);
    whooshFilter.Q.setValueAtTime(2.5, now);

    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0.01, now);
    whooshGain.gain.linearRampToValueAtTime(0.75, now + 0.32);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    whooshSource.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(masterGain);
    whooshSource.start(now);
    whooshSource.stop(now + 0.38);

    // --- 2. FIREWORK EXPLOSION BOOM! (0.34s -> 0.85s) ---
    const boomOsc = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(150, now + 0.34);
    boomOsc.frequency.exponentialRampToValueAtTime(35, now + 0.85);

    boomGain.gain.setValueAtTime(0.001, now + 0.34);
    boomGain.gain.linearRampToValueAtTime(0.95, now + 0.36);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

    boomOsc.connect(boomGain);
    boomGain.connect(masterGain);
    boomOsc.start(now + 0.34);
    boomOsc.stop(now + 1.0);

    // --- 3. TAALIYON KI AAWAZ (CLAPPING / APPLAUSE) (0.45s -> 2.5s) ---
    // Generate ~35 distinct crowd hand claps
    const clapCount = 35;
    for (let c = 0; c < clapCount; c++) {
      const clapOffset = 0.45 + Math.pow(Math.random(), 0.9) * 2.0;
      const clapTime = now + clapOffset;

      const clapSource = ctx.createBufferSource();
      clapSource.buffer = noiseBuffer;

      const clapFilter = ctx.createBiquadFilter();
      clapFilter.type = 'bandpass';
      clapFilter.frequency.setValueAtTime(1000 + Math.random() * 800, clapTime);
      clapFilter.Q.setValueAtTime(2.0, clapTime);

      const clapGain = ctx.createGain();
      let envelope = 1.0;
      if (clapOffset < 0.8) envelope = (clapOffset - 0.45) / 0.35;
      else if (clapOffset > 2.0) envelope = (2.5 - clapOffset) / 0.5;

      const vol = (0.5 + Math.random() * 0.45) * Math.max(0.15, envelope);

      clapGain.gain.setValueAtTime(0.001, clapTime);
      clapGain.gain.linearRampToValueAtTime(vol, clapTime + 0.003);
      clapGain.gain.exponentialRampToValueAtTime(0.0001, clapTime + 0.035);

      clapSource.connect(clapFilter);
      clapFilter.connect(clapGain);
      clapGain.connect(masterGain);

      clapSource.start(clapTime);
      clapSource.stop(clapTime + 0.04);
    }

    // Soft master fadeout
    masterGain.gain.setValueAtTime(1.0, now + 2.4);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.75);
  } catch (err) {
    console.warn('[UsmanWeb Sound] Web Audio error:', err);
  }
}

/**
 * Play the synchronized Fireworks + Clapping (Taaliyan) sound.
 */
export function playSubmissionSuccessSound() {
  if (typeof window === 'undefined') return;

  const nowMs = Date.now();
  if (nowMs - lastPlayTimestamp < PLAY_DEBOUNCE_MS) {
    return;
  }
  lastPlayTimestamp = nowMs;

  // 1. Play HTML5 Audio element (WAV contains launch whoosh -> BOOM -> enthusiastic crowd clapping)
  try {
    const audio = preloadedAudio || new Audio(celebrationSoundAsset);
    audio.currentTime = 0;
    audio.volume = 1.0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('[UsmanWeb Audio] Audio element play prevented, using WebAudio fallback:', err);
      });
    }
  } catch (err) {
    // Non-blocking
  }

  // 2. Play Web Audio API synthesis simultaneously for maximum presence
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        sharedAudioCtx = new AudioCtx();
      }

      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().then(() => {
          playWebAudioSynthesized(sharedAudioCtx);
        }).catch(() => {});
      } else {
        playWebAudioSynthesized(sharedAudioCtx);
      }
    }
  } catch (err) {
    // Non-blocking
  }
}
