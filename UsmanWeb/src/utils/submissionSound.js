/**
 * PIXX Rota System - UsmanWeb Attendance Submission Sound
 *
 * Provides a short, professional, celebratory clipping sound effect
 * played when daily attendance is successfully submitted to Sarfraz Khan.
 *
 * Guarantees:
 * - Plays exactly ONCE per successful submission.
 * - Handles browser autoplay restrictions (audio context priming on user click).
 * - Safe fallback if Web Audio API or audio elements are unavailable or blocked.
 * - Never interrupts attendance submission if audio playback fails.
 */

let sharedAudioCtx = null;
let lastPlayTimestamp = 0;
const PLAY_DEBOUNCE_MS = 2500; // Prevent playing twice within 2.5s

/**
 * Prime / unlock AudioContext on user interaction (e.g. when user clicks Submit).
 * This ensures mobile Safari & Chrome don't block playback after async network calls.
 */
export function unlockAudioContext() {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }

    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
  } catch (err) {
    // Non-blocking
  }
}

/**
 * Synthesizes a high-definition celebratory chime using Web Audio API:
 * 1. Initial tactile clipping click (0 - 18ms)
 * 2. Ascending harmonic major arpeggio (C5 -> E5 -> G5 -> C6 -> E6 -> G6)
 * 3. Crystal shimmer overtone with natural exponential decay (~1.3s)
 */
function playSynthesizedCelebration(ctx) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.35, now);
  masterGain.connect(ctx.destination);

  // 1. Tactile "clip" transient (subtle click for tactile confirmation)
  try {
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(2800, now);
    clickGain.gain.setValueAtTime(0.2, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
    clickOsc.connect(clickGain);
    clickGain.connect(masterGain);
    clickOsc.start(now);
    clickOsc.stop(now + 0.025);
  } catch {}

  // 2. Celebratory melodic chime arpeggio
  const notes = [
    { delay: 0.02, freq: 523.25, dur: 0.70, vol: 0.40 }, // C5
    { delay: 0.10, freq: 659.25, dur: 0.75, vol: 0.45 }, // E5
    { delay: 0.18, freq: 783.99, dur: 0.80, vol: 0.50 }, // G5
    { delay: 0.28, freq: 1046.50, dur: 0.90, vol: 0.55 }, // C6
    { delay: 0.38, freq: 1318.51, dur: 1.00, vol: 0.60 }, // E6
    { delay: 0.48, freq: 1567.98, dur: 0.95, vol: 0.38 }  // G6
  ];

  notes.forEach(({ delay, freq, dur, vol }) => {
    try {
      const noteTime = now + delay;
      // Fundamental oscillator (sine)
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      // Warm 2nd harmonic for shimmer
      const harm = ctx.createOscillator();
      const harmGain = ctx.createGain();
      harm.type = 'sine';
      harm.frequency.setValueAtTime(freq * 2, noteTime);

      // Volume envelope: fast attack (8ms), exponential decay
      oscGain.gain.setValueAtTime(0.0001, noteTime);
      oscGain.gain.linearRampToValueAtTime(vol, noteTime + 0.008);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, noteTime + dur);

      harmGain.gain.setValueAtTime(0.0001, noteTime);
      harmGain.gain.linearRampToValueAtTime(vol * 0.3, noteTime + 0.008);
      harmGain.gain.exponentialRampToValueAtTime(0.0001, noteTime + (dur * 0.7));

      osc.connect(oscGain);
      oscGain.connect(masterGain);

      harm.connect(harmGain);
      harmGain.connect(masterGain);

      osc.start(noteTime);
      osc.stop(noteTime + dur);

      harm.start(noteTime);
      harm.stop(noteTime + dur);
    } catch {}
  });

  // Soft fadeout
  masterGain.gain.setValueAtTime(0.35, now + 1.1);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
}

/**
 * Play the attendance submission celebratory clipping sound.
 * Guaranteed to play only once per successful batch submission.
 */
export function playSubmissionSuccessSound() {
  if (typeof window === 'undefined') return;

  const nowMs = Date.now();
  if (nowMs - lastPlayTimestamp < PLAY_DEBOUNCE_MS) {
    // Already played recently (debounced against duplicate events/renders)
    return;
  }
  lastPlayTimestamp = nowMs;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        sharedAudioCtx = new AudioCtx();
      }

      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().then(() => {
          playSynthesizedCelebration(sharedAudioCtx);
        }).catch(() => {
          fallbackAudioElementPlay();
        });
      } else {
        playSynthesizedCelebration(sharedAudioCtx);
      }
      return;
    }
  } catch (err) {
    // Web Audio failed, try audio element fallback
  }

  fallbackAudioElementPlay();
}

/**
 * Fallback to HTMLAudioElement using the generated asset.
 */
function fallbackAudioElementPlay() {
  try {
    const audio = new Audio('/assets/attendance-success.wav');
    audio.volume = 0.45;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Auto-play was prevented or audio failed, ignore silently
      });
    }
  } catch {
    // Silently ignore audio playback errors
  }
}
