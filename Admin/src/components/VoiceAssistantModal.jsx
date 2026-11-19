import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Square,
  X,
  Sparkles,
  Send,
  FileText,
  FileSpreadsheet,
  Download,
  RotateCcw,
  Globe,
  Bot,
  User,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  MessageSquare,
  PhoneCall,
  PhoneOff,
  Phone,
  Gauge,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import rotaLogo from '../assets/rota.png';
import { API_BASE_URL } from '../context/AuthContext';

/**
 * Format seconds into mm:ss call timer
 */
function formatCallTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Clean markdown for screen display
 */
function SimpleMarkdown({ content }) {
  if (!content) return null;
  const lines = content.split('\n');
  const elements = [];
  let currentTable = null;

  const flushTable = () => {
    if (currentTable && currentTable.rows.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} style={{
          margin: '10px 0',
          overflowX: 'auto',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(15, 23, 42, 0.6)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            {currentTable.headers && (
              <thead style={{ background: 'rgba(30, 41, 59, 0.8)', color: '#38bdf8' }}>
                <tr>
                  {currentTable.headers.map((h, i) => (
                    <th key={i} style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {currentTable.rows.map((row, rIdx) => (
                <tr key={rIdx} style={{
                  background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} style={{ padding: '6px 10px', color: '#cbd5e1' }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      currentTable = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      if (!currentTable) {
        currentTable = { headers: cells, rows: [] };
      } else {
        currentTable.rows.push(cells);
      }
      continue;
    }

    flushTable();

    if (!line) {
      elements.push(<div key={`br-${i}`} style={{ height: '6px' }} />);
      continue;
    }

    if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
      const text = line.replace(/^#+\s*/, '');
      elements.push(
        <h4 key={`h-${i}`} style={{ margin: '8px 0 4px', color: '#38bdf8', fontSize: '13px', fontWeight: 700 }}>
          {text}
        </h4>
      );
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const text = line.slice(2);
      elements.push(
        <div key={`li-${i}`} style={{ display: 'flex', gap: '6px', margin: '2px 0', fontSize: '12.5px', color: '#e2e8f0' }}>
          <span style={{ color: '#38bdf8' }}>•</span>
          <span>{text}</span>
        </div>
      );
      continue;
    }

    elements.push(
      <p key={`p-${i}`} style={{ margin: '4px 0', color: '#f1f5f9', fontSize: '13px', lineHeight: 1.5 }}>
        {line}
      </p>
    );
  }

  flushTable();
  return <div style={{ wordBreak: 'break-word' }}>{elements}</div>;
}

export default function VoiceAssistantModal({ isOpen, onClose }) {
  // Call Lifecycle: 'idle' (Pre-call dialer) | 'connecting' | 'connected' (In-call) | 'ended'
  const [callStatus, setCallStatus] = useState('idle');
  const [callDuration, setCallDuration] = useState(0);

  // In-call Voice states: 'greeting' | 'listening' | 'thinking' | 'speaking' | 'muted'
  const [voiceState, setVoiceState] = useState('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome-seed',
      role: 'assistant',
      content: '👋 **Salam & Welcome!**\n\nI am your real-time hands-free Rota Phone Assistant. Click **Start Call** to begin a natural, continuous two-way conversation.',
      spokenSummary: 'Salam! Main Pixx Rota Assistant hoon. Main aap ki kya madad kar sakta hoon?'
    }
  ]);
  const [languageMode, setLanguageMode] = useState('auto'); // 'auto' | 'ur' | 'en'
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [speechSpeed, setSpeechSpeed] = useState(1.0); // 1.0x or 0.85x
  const [errorMessage, setErrorMessage] = useState('');
  const [showTranscript, setShowTranscript] = useState(true);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // References
  const isCallActiveRef = useRef(false);
  const voiceStateRef = useRef('idle');
  const recognitionRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const animFrameRef = useRef(null);
  const messagesEndRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const lastSpokenAnswerRef = useRef('');
  const callTimerRef = useRef(null);
  const latestSpeechTextRef = useRef('');
  const restartTimerRef = useRef(null);

  // Keep voiceStateRef in sync with state
  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  // Keep isCallActiveRef in sync
  useEffect(() => {
    isCallActiveRef.current = callStatus === 'connected';
  }, [callStatus]);

  // Auto-scroll transcript
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript, voiceState]);

  // Call duration counter
  useEffect(() => {
    if (callStatus === 'connected') {
      setCallDuration(0);
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callStatus]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (callStatus === 'connected') {
          handleEndCall();
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, callStatus]);

  // Clean stop audio playback (Barge-in / Stop)
  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
    if (voiceStateRef.current === 'speaking') {
      setVoiceState('listening');
    }
  }, []);

  // Web Audio API Visualizer
  const setupAudioVisualizer = useCallback((stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { audioContextRef.current.close(); } catch {}
      }
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current || !isCallActiveRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch {}
  }, []);

  // Browser speech synthesis fallback
  const fallbackBrowserSpeech = useCallback((cleanText, detectedLang, onFinish) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onFinish) onFinish();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = speechSpeed;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices() || [];
      if (detectedLang === 'ur' || detectedLang === 'ur-Latn') {
        const urduVoice = voices.find(v => v.lang.startsWith('ur') || v.name.toLowerCase().includes('urdu') || v.lang.startsWith('hi'));
        if (urduVoice) utterance.voice = urduVoice;
        utterance.lang = urduVoice ? urduVoice.lang : 'en-GB';
      } else {
        const engVoice = voices.find(v => v.lang === 'en-GB' || v.lang === 'en-US');
        if (engVoice) utterance.voice = engVoice;
        utterance.lang = 'en-GB';
      }

      utterance.onend = () => {
        if (onFinish) onFinish();
      };
      utterance.onerror = () => {
        if (onFinish) onFinish();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      if (onFinish) onFinish();
    }
  }, [speechSpeed]);

  // Speak response aloud (with automated transition back to hands-free listening)
  const speakText = useCallback(async (textToSpeak, onCompletedCallback) => {
    if (!textToSpeak) {
      if (onCompletedCallback) onCompletedCallback();
      return;
    }

    stopSpeaking();
    setVoiceState('speaking');

    // If speaker is muted by user, don't play sound, just delay briefly and resume listening
    if (speakerMuted) {
      setTimeout(() => {
        if (onCompletedCallback) onCompletedCallback();
      }, 1500);
      return;
    }

    const isUrduScript = /[\u0600-\u06FF]/.test(textToSpeak);
    const isRomanUrdu = /\b(ka|ki|ke|ko|tha|thi|the|hoga|batao|dikhao|aaj|kal|par|mein|kitna|kitne|kon|unka|uska)\b/i.test(textToSpeak);
    const detectedLang = isUrduScript ? 'ur' : (isRomanUrdu ? 'ur-Latn' : 'en');

    try {
      // 1. Attempt Server-side studio quality Gemini TTS
      const res = await axios.post(`${API_BASE_URL}/ai/speak`, {
        text: textToSpeak,
        language: detectedLang
      }, { timeout: 7000 });

      if (res.data?.success && res.data?.audioBase64) {
        const audioSrc = `data:${res.data.mimeType || 'audio/wav'};base64,${res.data.audioBase64}`;
        const audio = new Audio(audioSrc);
        audioPlayerRef.current = audio;

        audio.onended = () => {
          audioPlayerRef.current = null;
          if (onCompletedCallback) onCompletedCallback();
        };

        audio.onerror = () => {
          fallbackBrowserSpeech(textToSpeak, detectedLang, onCompletedCallback);
        };

        await audio.play();
        return;
      }
    } catch (ttsErr) {
      console.warn('[Gemini TTS fallback]:', ttsErr.message);
    }

    // 2. Fallback to client browser SpeechSynthesis
    fallbackBrowserSpeech(textToSpeak, detectedLang, onCompletedCallback);
  }, [speakerMuted, stopSpeaking, fallbackBrowserSpeech]);

  // Auto resume listening after assistant speaks
  const resumeListeningAfterAnswer = useCallback(() => {
    if (!isCallActiveRef.current) return;
    setVoiceState('listening');
    setInterimTranscript('');
    latestSpeechTextRef.current = '';
    // Allow 250ms room echo clearance, then start clean recognition
    setTimeout(() => {
      if (isCallActiveRef.current && voiceStateRef.current === 'listening') {
        startContinuousListening();
      }
    }, 250);
  }, []);

  // Submit recognized question to AI backend
  const submitVoiceQuery = useCallback(async (queryText) => {
    const q = (queryText || '').trim();
    if (!q || !isCallActiveRef.current) {
      if (isCallActiveRef.current) setVoiceState('listening');
      return;
    }

    // Check for voice commands
    const lower = q.toLowerCase();

    // 1. Voice Command: Stop / Ruk jao
    if (/^(stop|ruk jao|bas|khamosh|chup|pause)$/i.test(lower)) {
      stopSpeaking();
      setVoiceState('listening');
      setInterimTranscript('');
      return;
    }

    // 2. Voice Command: Repeat / Dobara batao
    if (/^(repeat|repeat that|dobara batao|dobara bolo|phir se batao|phir se bolo)$/i.test(lower)) {
      if (lastSpokenAnswerRef.current) {
        speakText(lastSpokenAnswerRef.current, resumeListeningAfterAnswer);
      } else {
        speakText("I didn't say anything yet. How can I help you?", resumeListeningAfterAnswer);
      }
      return;
    }

    // 3. Voice Command: Speak slowly / Aahista bolo
    if (/\b(speak slowly|slow down|aahista bolo|ahista bolo)\b/i.test(lower)) {
      setSpeechSpeed(0.85);
      const ack = /[\u0600-\u06FF]/.test(q) || /\b(bolo|karo|batao)\b/i.test(lower)
        ? "Theek hai, ab main aahista bolunga."
        : "Sure, I will speak more slowly now.";
      speakText(ack, resumeListeningAfterAnswer);
      return;
    }

    // 4. Voice Command: End Call / Call kat do
    if (/\b(end call|hang up|call kat do|call band karo|call khatam|bye bye|goodbye|allah hafiz)\b/i.test(lower)) {
      const farewell = /[\u0600-\u06FF]/.test(q) || /\b(kat do|band karo|allah hafiz)\b/i.test(lower)
        ? "Khuda hafiz! Call khatam kar raha hoon."
        : "Goodbye! Ending call now.";
      speakText(farewell, () => {
        handleEndCall();
      });
      return;
    }

    // Stop speaking prior audio
    stopSpeaking();

    // Pause recognition while processing
    clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    setVoiceState('thinking');
    setErrorMessage('');
    setInterimTranscript('');

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: q
    };

    setMessages(prev => [...prev, userMsg]);

    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));

      const res = await axios.post(`${API_BASE_URL}/ai/chat`, {
        message: q,
        history
      });

      if (res.data?.success) {
        const spokenAnswer = res.data.spokenSummary || res.data.message || 'Done.';
        lastSpokenAnswerRef.current = spokenAnswer;

        const assistantMsg = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: res.data.message || 'Done.',
          spokenSummary: spokenAnswer,
          pdfReport: res.data.pdfReport || null,
          excelReport: res.data.excelReport || null
        };

        setMessages(prev => [...prev, assistantMsg]);

        // Speak aloud, then IMMEDIATELY & AUTOMATICALLY resume listening!
        speakText(spokenAnswer, resumeListeningAfterAnswer);
      } else {
        throw new Error(res.data?.message || 'Could not process voice request.');
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to process voice request.';
      setErrorMessage(errMsg);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `⚠️ **Error:** ${errMsg}`
        }
      ]);
      speakText("Sorry, I encountered an issue fetching that information.", resumeListeningAfterAnswer);
    }
  }, [messages, stopSpeaking, speakText, resumeListeningAfterAnswer]);

  // Start continuous, hands-free listening supervisor
  const startContinuousListening = useCallback((langOverride) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition && isCallActiveRef.current) {
      try {
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch {}
          recognitionRef.current = null;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;

        const activeLang = langOverride || languageMode;
        if (activeLang === 'ur') {
          recognition.lang = 'ur-PK';
        } else if (activeLang === 'en') {
          recognition.lang = 'en-GB';
        } else {
          // Auto / Mixed mode: en-GB is optimal for English + Roman Urdu loanwords without dropping speech
          recognition.lang = 'en-GB';
        }

        recognition.onstart = () => {
          if (voiceStateRef.current !== 'speaking' && voiceStateRef.current !== 'thinking') {
            setVoiceState('listening');
          }
        };

        recognition.onresult = (event) => {
          if (!isCallActiveRef.current) return;
          // While assistant is outputting audio, ignore microphone feedback
          if (voiceStateRef.current === 'speaking' || voiceStateRef.current === 'thinking') {
            return;
          }

          let finalAccumulated = '';
          let interimAccumulated = '';

          // Accumulate across the entire results collection to prevent dropping earlier words
          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            const text = res[0]?.transcript || '';
            if (res.isFinal) {
              finalAccumulated += text + ' ';
            } else {
              interimAccumulated += text;
            }
          }

          const fullSpoken = (finalAccumulated + interimAccumulated).trim();
          if (!fullSpoken) return;

          setInterimTranscript(fullSpoken);
          latestSpeechTextRef.current = fullSpoken;

          // Clear any pending turn submission timer
          clearTimeout(silenceTimerRef.current);

          // Natural VAD: wait 2000ms after final speech, 2800ms after interim speech
          const delay = finalAccumulated.trim() ? 2000 : 2800;
          silenceTimerRef.current = setTimeout(() => {
            if (latestSpeechTextRef.current.trim() && isCallActiveRef.current && voiceStateRef.current === 'listening') {
              const turnText = latestSpeechTextRef.current.trim();
              latestSpeechTextRef.current = '';
              setInterimTranscript('');
              submitVoiceQuery(turnText);
            }
          }, delay);
        };

        recognition.onerror = (event) => {
          // 'no-speech' and 'aborted' are standard normal lifecycle events in Web Speech API
          if (event.error === 'no-speech' || event.error === 'aborted') {
            return;
          }
          if (event.error === 'not-allowed') {
            setErrorMessage('Microphone permission was denied. Please allow microphone in browser settings.');
          } else if (event.error === 'audio-capture') {
            setErrorMessage('No microphone detected. Please check your audio input device.');
          } else {
            console.warn('[SpeechRecognition Notice]:', event.error);
          }
        };

        // Continuous Watchdog: Auto-restart recognition smoothly if it stops while listening
        recognition.onend = () => {
          if (!isCallActiveRef.current) return;
          if (voiceStateRef.current === 'thinking' || voiceStateRef.current === 'speaking') {
            return;
          }
          clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (isCallActiveRef.current && voiceStateRef.current === 'listening') {
              try { recognition.start(); } catch {}
            }
          }, 200);
        };

        recognition.start();
        return;
      } catch (recErr) {
        console.warn('[SpeechRecognition initialization error]:', recErr.message);
      }
    }
  }, [languageMode, submitVoiceQuery]);

  // Handle live language switch during active call
  const handleLanguageChange = (newLang) => {
    setLanguageMode(newLang);
    if (isCallActiveRef.current && voiceStateRef.current === 'listening') {
      startContinuousListening(newLang);
    }
  };

  // Start Call Handler (Single click initiates continuous telephone conversation)
  const handleStartCall = async () => {
    setCallStatus('connecting');
    setErrorMessage('');
    setVoiceState('connecting');

    try {
      // 1. Request microphone permission with echo cancellation & noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      micStreamRef.current = stream;
      setupAudioVisualizer(stream);

      // 2. Set connected call status
      setCallStatus('connected');
      isCallActiveRef.current = true;

      // 3. Play natural welcoming greeting aloud, then seamlessly enter continuous listening ONCE finished
      const initialGreeting = languageMode === 'ur'
        ? "Salam! Main Pixx Rota Assistant hoon. Main aap ki kya madad kar sakta hoon?"
        : languageMode === 'en'
        ? "Hello! I am your Rota System Assistant. How can I help you today?"
        : "Salam! Main Pixx Rota Assistant hoon. Aap kisi bhi worker, shop ya attendance ke bare mein pooch sakte hain.";

      lastSpokenAnswerRef.current = initialGreeting;

      // Speak greeting FIRST, and as soon as it completes, start listening hands-free!
      speakText(initialGreeting, () => {
        resumeListeningAfterAnswer();
      });
    } catch (micErr) {
      console.error('[Microphone Access Error]:', micErr);
      setCallStatus('idle');
      setVoiceState('idle');
      setErrorMessage('Microphone access was denied. Please enable your microphone to start the call.');
    }
  };

  // End Call Handler
  const handleEndCall = () => {
    isCallActiveRef.current = false;
    clearTimeout(silenceTimerRef.current);
    clearTimeout(restartTimerRef.current);

    stopSpeaking();

    // 1. Stop SpeechRecognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    // 2. Stop audio tracks
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }

    // 3. Stop visualizer animation
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // 4. Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    setCallStatus('ended');
    setVoiceState('idle');
    setVolumeLevel(0);
    setInterimTranscript('');
  };

  // Reset to idle pre-call screen
  const handleResetToPreCall = () => {
    handleEndCall();
    setCallStatus('idle');
    setCallDuration(0);
  };

  // Toggle Microphone Mute
  const handleToggleMicMute = () => {
    if (!micStreamRef.current) return;
    const newMuted = !micMuted;
    setMicMuted(newMuted);
    micStreamRef.current.getAudioTracks().forEach(t => {
      t.enabled = !newMuted;
    });
    if (newMuted) {
      setVoiceState('muted');
    } else {
      setVoiceState('listening');
    }
  };

  // Full Close Modal
  const handleClose = () => {
    handleEndCall();
    setCallStatus('idle');
    setCallDuration(0);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
      backgroundColor: '#070b19',
      backgroundImage: 'radial-gradient(ellipse at 50% 15%, #1e1b4b 0%, #070b19 75%)',
      display: 'flex',
      flexDirection: 'column',
      color: '#ffffff',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      animation: 'fadeIn 0.25s ease-out'
    }}>
      {/* ── HEADER NAVIGATION & STATUS ───────────────────────────────────────── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(7, 11, 25, 0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 10
      }}>
        {/* Branding & Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={rotaLogo}
            alt="Rota System"
            style={{
              height: '38px',
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 8px rgba(56, 189, 248, 0.3))'
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.5px' }}>
                ROTA PHONE ASSISTANT
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                background: callStatus === 'connected' ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #0ea5e9, #8b5cf6)',
                color: '#ffffff',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  animation: callStatus === 'connected' ? 'ping 1.5s infinite' : 'none'
                }} />
                {callStatus === 'connected' ? 'Live Call' : 'Phone Mode'}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {callStatus === 'connected'
                ? `Call in progress • ${formatCallTimer(callDuration)} • Hands-Free Continuous`
                : 'Real-Time Conversational Call • English + Urdu + Roman Urdu'}
            </span>
          </div>
        </div>

        {/* Top Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Language Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(255, 255, 255, 0.06)',
            padding: '5px 10px',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <Globe size={14} color="#38bdf8" />
            <select
              value={languageMode}
              onChange={(e) => handleLanguageChange(e.target.value)}
              title="Change spoken recognition language"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#e2e8f0',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="auto" style={{ background: '#0f172a', color: '#fff' }}>Auto (English + Roman Urdu)</option>
              <option value="ur" style={{ background: '#0f172a', color: '#fff' }}>اردو (Urdu Script)</option>
              <option value="en" style={{ background: '#0f172a', color: '#fff' }}>English (UK)</option>
            </select>
          </div>

          {/* Close Window */}
          <button
            onClick={callStatus === 'connected' ? handleEndCall : handleClose}
            title="Close / Exit"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#cbd5e1',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* ── PRE-CALL DIALER SCREEN (Before the call) ─────────────────────────── */}
      {callStatus === 'idle' && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          maxWidth: '560px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Logo & Ambient Glow */}
          <div style={{
            position: 'relative',
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(124, 58, 237, 0.2))',
            border: '2px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
            boxShadow: '0 0 40px rgba(56, 189, 248, 0.25)'
          }}>
            <img
              src={rotaLogo}
              alt="Rota System Logo"
              style={{ width: '70px', height: 'auto', objectFit: 'contain' }}
            />
          </div>

          <h2 style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 8px', letterSpacing: '0.3px' }}>
            AI Workforce Voice Call
          </h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: '0 0 28px', lineHeight: 1.6 }}>
            Experience natural, hands-free phone conversation with the Pixx Rota System.
            Ask about any worker, shop, daily attendance, rota shifts, or weekly salaries in English or Urdu.
          </p>

          {/* Large START CALL Button */}
          <button
            onClick={handleStartCall}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '16px 42px',
              borderRadius: '36px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '18px',
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 0 35px rgba(16, 185, 129, 0.55)',
              transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              letterSpacing: '0.4px'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.04)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
          >
            <PhoneCall size={24} />
            <span>Start Call / کال شروع کریں</span>
          </button>

          {/* Feature Highlights */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            marginTop: '36px',
            width: '100%',
            textAlign: 'left'
          }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '12px 14px',
              borderRadius: '12px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
                🎙️ Hands-Free
              </div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.4 }}>
                Click once. Assistant listens and responds continuously.
              </div>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '12px 14px',
              borderRadius: '12px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#a855f7', marginBottom: '4px' }}>
                ⚡ Interruption
              </div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.4 }}>
                Interrupt anytime by speaking over the assistant.
              </div>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '12px 14px',
              borderRadius: '12px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#34d399', marginBottom: '4px' }}>
                🌐 Multilingual
              </div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.4 }}>
                Speaks and understands Urdu, English, and Roman Urdu.
              </div>
            </div>
          </div>

          {errorMessage && (
            <div style={{
              marginTop: '20px',
              padding: '10px 16px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '10px',
              color: '#fca5a5',
              fontSize: '12px'
            }}>
              {errorMessage}
            </div>
          )}
        </div>
      )}

      {/* ── CALL CONNECTING STATE ────────────────────────────────────────────── */}
      {callStatus === 'connecting' && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            animation: 'pulse 1.5s infinite'
          }}>
            <Phone size={36} color="#ffffff" />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px' }}>Connecting Voice Call...</h3>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>Establishing secure microphone audio stream</p>
        </div>
      )}

      {/* ── CALL ENDED SUMMARY SCREEN ────────────────────────────────────────── */}
      {callStatus === 'ended' && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '70px',
            height: '70px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '2px solid rgba(239, 68, 68, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <PhoneOff size={32} color="#f87171" />
          </div>
          <h3 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px' }}>Call Ended</h3>
          <p style={{ fontSize: '13.5px', color: '#94a3b8', margin: '0 0 24px' }}>
            Call duration: {formatCallTimer(callDuration)} • {messages.length - 1} questions answered
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleStartCall}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 28px',
                borderRadius: '24px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <PhoneCall size={18} />
              Call Again
            </button>
            <button
              onClick={handleClose}
              style={{
                padding: '12px 24px',
                borderRadius: '24px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── ACTIVE CALL INTERFACE (During the call) ───────────────────────────── */}
      {callStatus === 'connected' && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: '16px 24px 100px',
          boxSizing: 'border-box'
        }}>
          {/* Main Calling Stage: Pulsing Calling Orb + Real-time Audio Waves */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 0 20px',
            textAlign: 'center'
          }}>
            {/* Animated Calling Orb */}
            <div style={{
              position: 'relative',
              width: '120px',
              height: '120px',
              marginBottom: '16px'
            }}>
              {/* Outer Pulsing Soundwave Glow */}
              <div style={{
                position: 'absolute',
                top: '-16px',
                left: '-16px',
                right: '-16px',
                bottom: '-16px',
                borderRadius: '50%',
                border: voiceState === 'listening'
                  ? '2px solid rgba(74, 222, 128, 0.5)'
                  : voiceState === 'speaking'
                  ? '2px solid rgba(168, 85, 247, 0.5)'
                  : '2px solid rgba(56, 189, 248, 0.3)',
                boxShadow: voiceState === 'listening'
                  ? '0 0 30px rgba(74, 222, 128, 0.4)'
                  : voiceState === 'speaking'
                  ? '0 0 35px rgba(168, 85, 247, 0.5)'
                  : '0 0 20px rgba(56, 189, 248, 0.25)',
                animation: 'pulse 1.6s infinite'
              }} />

              {/* Inner Orb */}
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: voiceState === 'listening'
                  ? 'linear-gradient(135deg, #15803d, #22c55e)'
                  : voiceState === 'speaking'
                  ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
                  : voiceState === 'thinking'
                  ? 'linear-gradient(135deg, #0284c7, #38bdf8)'
                  : 'linear-gradient(135deg, #334155, #475569)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                transform: `scale(${1 + volumeLevel * 0.0035})`,
                transition: 'transform 0.1s ease'
              }}>
                {voiceState === 'listening' ? (
                  <Mic size={46} color="#ffffff" />
                ) : voiceState === 'speaking' ? (
                  <Volume2 size={46} color="#ffffff" />
                ) : voiceState === 'thinking' ? (
                  <Sparkles size={46} color="#ffffff" className="spin" />
                ) : (
                  <MicOff size={46} color="#ffffff" />
                )}
              </div>
            </div>

            {/* Dynamic Calling Status Headline */}
            <h3 style={{
              margin: '0 0 4px',
              fontSize: '20px',
              fontWeight: 800,
              color: voiceState === 'listening'
                ? '#4ade80'
                : voiceState === 'speaking'
                ? '#c084fc'
                : voiceState === 'thinking'
                ? '#38bdf8'
                : '#f87171'
            }}>
              {voiceState === 'listening' && 'Listening to you... / میں سن رہا ہوں'}
              {voiceState === 'speaking' && 'Assistant is speaking... (Speak to interrupt)'}
              {voiceState === 'thinking' && 'Understanding your question... / سمجھ رہا ہوں'}
              {voiceState === 'muted' && 'Microphone Muted / مائیک بند ہے'}
            </h3>

            {/* Real-time Frequency Waveform Visualizer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              height: '24px',
              marginTop: '8px'
            }}>
              {[20, 45, 75, 95, 60, 85, 100, 70, 90, 50, 80, 30].map((h, i) => {
                const liveH = voiceState === 'listening'
                  ? Math.max(6, Math.min(24, Math.round((volumeLevel / 100) * h)))
                  : voiceState === 'speaking'
                  ? Math.max(8, Math.min(24, Math.round((Math.sin((Date.now() / 150) + i) + 1) * 11)))
                  : 4;
                return (
                  <span
                    key={i}
                    style={{
                      width: '3.5px',
                      height: `${liveH}px`,
                      borderRadius: '2px',
                      background: voiceState === 'listening' ? '#4ade80' : voiceState === 'speaking' ? '#c084fc' : '#475569',
                      transition: 'height 0.08s ease'
                    }}
                  />
                );
              })}
            </div>

            {/* Quick In-Call Language Selector Pills */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '10px',
              flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Speaking:</span>
              {[
                { id: 'auto', label: '🌐 Auto (Eng / Roman Urdu)' },
                { id: 'ur', label: '🇵🇰 اردو (Urdu Script)' },
                { id: 'en', label: '🇬🇧 English' }
              ].map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => handleLanguageChange(btn.id)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    border: languageMode === btn.id ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: languageMode === btn.id ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    color: languageMode === btn.id ? '#ffffff' : '#cbd5e1',
                    fontSize: '11px',
                    fontWeight: languageMode === btn.id ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Live Interim Speech Bubble with Instant Send Button */}
            {voiceState === 'listening' && interimTranscript && (
              <div style={{
                marginTop: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                justifyContent: 'center'
              }}>
                <div style={{
                  padding: '8px 16px',
                  borderRadius: '16px',
                  background: 'rgba(30, 58, 138, 0.4)',
                  border: '1px solid rgba(96, 165, 250, 0.4)',
                  color: '#93c5fd',
                  fontSize: '13px',
                  fontStyle: 'italic',
                  maxWidth: '520px'
                }}>
                  "{interimTranscript}"
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (latestSpeechTextRef.current.trim()) {
                      clearTimeout(silenceTimerRef.current);
                      const t = latestSpeechTextRef.current.trim();
                      latestSpeechTextRef.current = '';
                      setInterimTranscript('');
                      submitVoiceQuery(t);
                    }
                  }}
                  title="Send now without waiting for pause"
                  style={{
                    padding: '6px 14px',
                    borderRadius: '18px',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)'
                  }}
                >
                  <Send size={12} />
                  <span>Send Now / ابھی پوچھیں</span>
                </button>
              </div>
            )}

            {/* Manual Interrupt Button (Also triggers automatically on voice) */}
            {voiceState === 'speaking' && (
              <button
                onClick={stopSpeaking}
                style={{
                  marginTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  background: 'rgba(239, 68, 68, 0.25)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#fca5a5',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Square size={12} fill="#fca5a5" />
                Tap to Interrupt (or speak directly)
              </button>
            )}
          </div>

          {/* ── CONVERSATION TRANSCRIPT (Scrollable Cards) ──────────────────────── */}
          {showTranscript && (
            <div style={{
              flex: 1,
              maxWidth: '720px',
              width: '100%',
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      alignSelf: isUser ? 'flex-end' : 'flex-start',
                      maxWidth: '88%',
                      flexDirection: isUser ? 'row-reverse' : 'row'
                    }}
                  >
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      background: isUser ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {isUser ? <User size={15} color="#fff" /> : <Bot size={15} color="#fff" />}
                    </div>

                    <div style={{
                      background: isUser ? 'linear-gradient(135deg, #1e3a8a, #1e40af)' : 'rgba(15, 23, 42, 0.75)',
                      border: isUser ? '1px solid rgba(96, 165, 250, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      padding: '10px 14px',
                      backdropFilter: 'blur(8px)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: isUser ? '#93c5fd' : '#c084fc' }}>
                          {isUser ? 'You' : 'Rota Assistant'}
                        </span>
                        {!isUser && m.spokenSummary && !speakerMuted && (
                          <button
                            onClick={() => speakText(m.spokenSummary, resumeListeningAfterAnswer)}
                            title="Replay Voice"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#38bdf8',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <Volume2 size={13} />
                          </button>
                        )}
                      </div>

                      <SimpleMarkdown content={m.content} />

                      {/* PDF Report Download */}
                      {m.pdfReport && (
                        <div style={{ marginTop: '8px' }}>
                          <a
                            href={`${API_BASE_URL}/ai/download-report/${m.pdfReport.token}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 12px',
                              background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                              color: '#ffffff',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              textDecoration: 'none'
                            }}
                          >
                            <Download size={13} />
                            Download {m.pdfReport.fileName || 'PDF Report'}
                          </a>
                        </div>
                      )}

                      {/* Excel Sheet Download */}
                      {m.excelReport && (
                        <div style={{ marginTop: '8px' }}>
                          <a
                            href={`${API_BASE_URL}/ai/download-report/${m.excelReport.token}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 12px',
                              background: 'linear-gradient(135deg, #15803d, #22c55e)',
                              color: '#ffffff',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              textDecoration: 'none'
                            }}
                          >
                            <Download size={13} />
                            Download {m.excelReport.fileName || 'Excel Sheet'}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      )}

      {/* ── CALL ACTION DOCK (Fixed Bottom Controls during Call) ─────────────── */}
      {callStatus === 'connected' && (
        <div style={{
          position: 'fixed',
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          padding: '10px 20px',
          borderRadius: '40px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(16px)'
        }}>
          {/* Mute Microphone */}
          <button
            onClick={handleToggleMicMute}
            title={micMuted ? "Unmute Microphone" : "Mute Microphone"}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: micMuted ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.08)',
              border: micMuted ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: micMuted ? '#f87171' : '#ffffff',
              cursor: 'pointer'
            }}
          >
            {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {/* Mute Speaker */}
          <button
            onClick={() => {
              if (!speakerMuted && voiceState === 'speaking') stopSpeaking();
              setSpeakerMuted(!speakerMuted);
            }}
            title={speakerMuted ? "Unmute Assistant Speaker" : "Mute Assistant Speaker"}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: speakerMuted ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.08)',
              border: speakerMuted ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: speakerMuted ? '#f87171' : '#ffffff',
              cursor: 'pointer'
            }}
          >
            {speakerMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          {/* Speech Rate Toggle (1.0x / 0.85x) */}
          <button
            onClick={() => setSpeechSpeed(speechSpeed === 1.0 ? 0.85 : 1.0)}
            title="Speech Speed"
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              background: speechSpeed < 1.0 ? 'rgba(14, 165, 233, 0.25)' : 'rgba(255, 255, 255, 0.08)',
              border: speechSpeed < 1.0 ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)',
              color: speechSpeed < 1.0 ? '#38bdf8' : '#cbd5e1',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Gauge size={13} />
            <span>{speechSpeed === 1.0 ? '1.0x' : '0.85x'}</span>
          </button>

          {/* Text Input Toggle Fallback */}
          <button
            onClick={() => setShowTextInput(!showTextInput)}
            title="Toggle Text Drawer"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: showTextInput ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.08)',
              border: showTextInput ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer'
            }}
          >
            <MessageSquare size={18} />
          </button>

          {/* BIG RED END CALL BUTTON */}
          <button
            onClick={handleEndCall}
            title="End Call / کال ختم کریں"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 22px',
              borderRadius: '30px',
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 800,
              fontSize: '13.5px',
              cursor: 'pointer',
              boxShadow: '0 0 25px rgba(220, 38, 38, 0.55)',
              letterSpacing: '0.3px'
            }}
          >
            <PhoneOff size={18} />
            <span>End Call</span>
          </button>
        </div>
      )}

      {/* ── TEXT INPUT FALLBACK DRAWER ───────────────────────────────────────── */}
      {callStatus === 'connected' && showTextInput && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '600px',
          zIndex: 110,
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px',
          padding: '10px 14px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7)'
        }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (textInput.trim()) {
                submitVoiceQuery(textInput);
                setTextInput('');
                setShowTextInput(false);
              }
            }}
            style={{ display: 'flex', gap: '8px' }}
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your question if in a noisy room..."
              autoFocus
              style={{
                flex: 1,
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#ffffff',
                fontSize: '13px',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={!textInput.trim()}
              style={{
                padding: '0 16px',
                background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                cursor: textInput.trim() ? 'pointer' : 'default',
                opacity: textInput.trim() ? 1 : 0.5
              }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}

      {/* Embedded CSS animations */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.06); opacity: 0.4; }
          100% { transform: scale(1); opacity: 0.8; }
        }
        @keyframes ping {
          0% { transform: scale(1); opacity: 1; }
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
