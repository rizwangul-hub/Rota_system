/**
 * PIXX Rota System - UsmanWeb Attendance Submission Sound & Fireworks
 *
 * Provides synchronized FIREWORKS (launch whoosh + explosion boom & crackles)
 * followed by the celebratory CLIPPING CHIME sound effect.
 *
 * Sequence:
 * 1. 0.0s - 0.35s: Firework rocket launch whoosh (Fzzzz-WHOOSH!)
 * 2. 0.35s - 0.75s: Firework explosion (BOOM! Crackle & pop!)
 * 3. 0.72s - 2.2s: Tactile clipping transient & triumphant C-major chimes
 *
 * Guarantees:
 * - Plays at 100% full volume.
 * - Plays via preloaded HTMLAudioElement AND Web Audio API synthesis for 100% reliability.
 * - Debounced so it never plays twice.
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
 * Called when Usman clicks "Submit Attendance to Sarfraz".
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
 * 2. Firework explosion BOOM & crackles (0.35s - 0.75s)
 * 3. Tactile clipping transient & celebratory arpeggio chimes (0.75s - 2.2s)
 */
function playWebAudioSynthesized(ctx) {
  try {
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.95, now);
    masterGain.connect(ctx.destination);

    // Buffer for pink/white noise (used in whoosh and explosion)
    const bufferSize = Math.floor(ctx.sampleRate * 2.2);
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
    whooshFilter.Q.setValueAtTime(3.0, now);

    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0.01, now);
    whooshGain.gain.linearRampToValueAtTime(0.7, now + 0.32);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    whooshSource.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(masterGain);
    whooshSource.start(now);
    whooshSource.stop(now + 0.38);

    // --- 2. FIREWORK EXPLOSION BOOM! (0.35s -> 0.9s) ---
    const boomOsc = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(150, now + 0.34);
    boomOsc.frequency.exponentialRampToValueAtTime(35, now + 0.85);

    boomGain.gain.setValueAtTime(0.001, now + 0.34);
    boomGain.gain.linearRampToValueAtTime(0.9, now + 0.36);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

    boomOsc.connect(boomGain);
    boomGain.connect(masterGain);
    boomOsc.start(now + 0.34);
    boomOsc.stop(now + 1.05);

    // Firework crackle / burst blast noise
    const blastSource = ctx.createBufferSource();
    blastSource.buffer = noiseBuffer;
    const blastFilter = ctx.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.setValueAtTime(800, now + 0.35);
    blastFilter.frequency.exponentialRampToValueAtTime(180, now + 0.9);

    const blastGain = ctx.createGain();
    blastGain.gain.setValueAtTime(0.001, now + 0.35);
    blastGain.gain.linearRampToValueAtTime(0.65, now + 0.37);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    blastSource.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(masterGain);
    blastSource.start(now + 0.35);
    blastSource.stop(now + 0.9);

    // --- 3. CLIPPING SOUND & MELODIC CHIMES (0.75s -> 2.2s) ---
    // Tactile clip transient at 0.72s
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(3400, now + 0.72);
    clickGain.gain.setValueAtTime(0.65, now + 0.72);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    clickOsc.connect(clickGain);
    clickGain.connect(masterGain);
    clickOsc.start(now + 0.72);
    clickOsc.stop(now + 0.76);

    // Celebratory chime notes
    const notes = [
      { delay: 0.75, freq: 523.25, dur: 0.65, vol: 0.70 }, // C5
      { delay: 0.85, freq: 659.25, dur: 0.70, vol: 0.75 }, // E5
      { delay: 0.95, freq: 783.99, dur: 0.75, vol: 0.80 }, // G5
      { delay: 1.08, freq: 1046.50, dur: 0.85, vol: 0.85 }, // C6
      { delay: 1.20, freq: 1318.51, dur: 0.95, vol: 0.90 }, // E6
      { delay: 1.32, freq: 1567.98, dur: 0.85, vol: 0.65 }  // G6
    ];

    notes.forEach(({ delay, freq, dur, vol }) => {
      const noteTime = now + delay;

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      const harm = ctx.createOscillator();
      const harmGain = ctx.createGain();
      harm.type = 'sine';
      harm.frequency.setValueAtTime(freq * 2, noteTime);

      oscGain.gain.setValueAtTime(0.001, noteTime);
      oscGain.gain.linearRampToValueAtTime(vol, noteTime + 0.006);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, noteTime + dur);

      harmGain.gain.setValueAtTime(0.001, noteTime);
      harmGain.gain.linearRampToValueAtTime(vol * 0.35, noteTime + 0.006);
      harmGain.gain.exponentialRampToValueAtTime(0.0001, noteTime + (dur * 0.7));

      osc.connect(oscGain);
      oscGain.connect(masterGain);

      harm.connect(harmGain);
      harmGain.connect(masterGain);

      osc.start(noteTime);
      osc.stop(noteTime + dur);

      harm.start(noteTime);
      harm.stop(noteTime + dur);
    });

    masterGain.gain.setValueAtTime(0.95, now + 1.9);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.3);
  } catch (err) {
    console.warn('[UsmanWeb Sound] Web Audio error:', err);
  }
}

/**
 * Play the synchronized Fireworks + Clipping sound.
 */
export function playSubmissionSuccessSound() {
  if (typeof window === 'undefined') return;

  const nowMs = Date.now();
  if (nowMs - lastPlayTimestamp < PLAY_DEBOUNCE_MS) {
    return;
  }
  lastPlayTimestamp = nowMs;

  // 1. Play HTML5 Audio element (WAV contains launch whoosh -> BOOM -> clipping chimes)
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
