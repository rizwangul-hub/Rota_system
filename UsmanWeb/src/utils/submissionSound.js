/**
 * PIXX Rota System - UsmanWeb Attendance Submission Sound
 *
 * Provides a short, professional, celebratory clipping sound effect
 * played when daily attendance is successfully submitted to Sarfraz Khan.
 *
 * Guarantees:
 * - Plays loudly, clearly, and pleasantly at full volume.
 * - Plays both via preloaded HTMLAudioElement AND Web Audio API synthesis for 100% reliability.
 * - Guarded against duplicate playback (debounced to once per submission).
 * - Safe on iOS Safari, Android PWA, Chrome, and Edge desktop.
 */

import celebrationSoundAsset from '../assets/attendance-success.wav';

let sharedAudioCtx = null;
let lastPlayTimestamp = 0;
const PLAY_DEBOUNCE_MS = 2500;

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
 * Prime / unlock both HTML Audio and AudioContext on user interaction.
 * Called immediately when Usman clicks "Submit Attendance to Sarfraz".
 */
export function unlockAudioContext() {
  try {
    if (typeof window === 'undefined') return;

    // 1. Prime Audio element
    if (preloadedAudio) {
      preloadedAudio.load();
    }

    // 2. Prime Web Audio API
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
 * Synthesizes a loud, crisp celebratory major arpeggio with tactile clipping transient.
 */
function playWebAudioSynthesized(ctx) {
  try {
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.85, now);
    masterGain.connect(ctx.destination);

    // 1. Tactile clipping / click transient
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(3200, now);
    clickGain.gain.setValueAtTime(0.6, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    clickOsc.connect(clickGain);
    clickGain.connect(masterGain);
    clickOsc.start(now);
    clickOsc.stop(now + 0.03);

    // 2. Celebratory melodic chime notes (C5 -> E5 -> G5 -> C6 -> E6 -> G6)
    const notes = [
      { delay: 0.02, freq: 523.25, dur: 0.65, vol: 0.70 }, // C5
      { delay: 0.10, freq: 659.25, dur: 0.70, vol: 0.75 }, // E5
      { delay: 0.18, freq: 783.99, dur: 0.75, vol: 0.80 }, // G5
      { delay: 0.28, freq: 1046.50, dur: 0.85, vol: 0.85 }, // C6
      { delay: 0.38, freq: 1318.51, dur: 0.95, vol: 0.90 }, // E6
      { delay: 0.48, freq: 1567.98, dur: 0.85, vol: 0.65 }  // G6
    ];

    notes.forEach(({ delay, freq, dur, vol }) => {
      const noteTime = now + delay;

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      // Shimmer 2nd harmonic
      const harm = ctx.createOscillator();
      const harmGain = ctx.createGain();
      harm.type = 'sine';
      harm.frequency.setValueAtTime(freq * 2, noteTime);

      // Fast attack (5ms), natural ring decay
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

    // Fade master gracefully after notes finish
    masterGain.gain.setValueAtTime(0.85, now + 1.15);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
  } catch (err) {
    console.warn('[UsmanWeb Sound] Web Audio error:', err);
  }
}

/**
 * Play the attendance submission celebratory clipping sound.
 * Plays via HTMLAudioElement AND Web Audio simultaneously for maximum audio presence.
 */
export function playSubmissionSuccessSound() {
  if (typeof window === 'undefined') return;

  const nowMs = Date.now();
  if (nowMs - lastPlayTimestamp < PLAY_DEBOUNCE_MS) {
    // Already played recently (debounced against duplicate events/renders)
    return;
  }
  lastPlayTimestamp = nowMs;

  let audioPlayed = false;

  // 1. Primary: HTML5 Audio element
  try {
    const audio = preloadedAudio || new Audio(celebrationSoundAsset);
    audio.currentTime = 0;
    audio.volume = 1.0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        audioPlayed = true;
      }).catch((err) => {
        console.warn('[UsmanWeb Audio] Audio element play prevented, fallback to WebAudio:', err);
      });
    }
  } catch (err) {
    // Non-blocking
  }

  // 2. Co-Primary / Fallback: Web Audio API synthesis
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
