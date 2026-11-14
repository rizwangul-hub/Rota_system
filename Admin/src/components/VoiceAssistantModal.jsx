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
  MessageSquare
} from 'lucide-react';
import rotaLogo from '../assets/rota.png';
import { API_BASE_URL } from '../context/AuthContext';

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
        <h4 key={`h-${i}`} style={{ margin: '8px 0 4px', color: '#67e8f9', fontSize: '13px', fontWeight: 700 }}>
          {text}
        </h4>
      );
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={`li-${i}`} style={{ display: 'flex', gap: '6px', margin: '2px 0', color: '#e2e8f0', fontSize: '13px' }}>
          <span style={{ color: '#38bdf8' }}>•</span>
          <span>{line.substring(2)}</span>
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

export default function VoiceAssistantModal({ isOpen, onClose, initialQuery = '' }) {
  // Voice states: 'ready' | 'listening' | 'processing' | 'speaking'
  const [voiceState, setVoiceState] = useState('ready');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'init-msg',
      role: 'assistant',
      content: '👋 **Salam & Welcome!**\n\nI am your voice-powered Rota & Workforce Assistant. You can speak to me in **English**, **اردو (Urdu)**, or **Roman Urdu**.',
      spokenSummary: 'Welcome to Pixx Rota System. You can ask me anything about staff, shops, attendance, or salaries.'
    }
  ]);
  const [languageMode, setLanguageMode] = useState('auto'); // 'auto' | 'ur' | 'en'
  const [audioMuted, setAudioMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Audio & Speech references
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const animFrameRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll transcript
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript, voiceState]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (voiceState === 'speaking') {
          stopSpeaking();
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, voiceState]);

  // Clean stop audio playback
  const stopSpeaking = useCallback(() => {
    // 1. Cancel browser speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    // 2. Pause and reset HTML Audio player if playing Gemini TTS
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
    if (voiceState === 'speaking') {
      setVoiceState('ready');
    }
  }, [voiceState]);

  // Clean stop microphone recording
  const stopMicrophone = useCallback(() => {
    // 1. Stop SpeechRecognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    // 2. Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    // 3. Stop audio visualizer tracks
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setVolumeLevel(0);
  }, []);

  // Full cleanup on modal close or unmount
  const handleClose = useCallback(() => {
    stopSpeaking();
    stopMicrophone();
    setVoiceState('ready');
    setInterimTranscript('');
    setErrorMessage('');
    onClose();
  }, [stopSpeaking, stopMicrophone, onClose]);

  // Text-To-Speech Player: tries server-side Gemini TTS first, falls back to window.speechSynthesis
  const speakText = useCallback(async (textToSpeak, langHint = 'auto') => {
    if (audioMuted || !textToSpeak) return;

    stopSpeaking();
    setVoiceState('speaking');

    // Detect if text is mostly Urdu script or Roman Urdu
    const isUrduScript = /[\u0600-\u06FF]/.test(textToSpeak);
    const isRomanUrdu = /\b(ka|ki|ke|ko|tha|thi|the|hoga|batao|dikhao|aaj|kal|par|mein|kitna|kitne|kon|unka|uska)\b/i.test(textToSpeak);
    const detectedLang = isUrduScript ? 'ur' : (isRomanUrdu ? 'ur-Latn' : 'en');

    try {
      // 1. Attempt Server-side studio quality Gemini TTS
      const res = await axios.post(`${API_BASE_URL}/ai/speak`, {
        text: textToSpeak,
        language: detectedLang
      }, { timeout: 8000 });

      if (res.data?.success && res.data?.audioBase64) {
        const audioSrc = `data:${res.data.mimeType || 'audio/wav'};base64,${res.data.audioBase64}`;
        const audio = new Audio(audioSrc);
        audioPlayerRef.current = audio;

        audio.onended = () => {
          audioPlayerRef.current = null;
          setVoiceState('ready');
        };

        audio.onerror = () => {
          fallbackBrowserSpeech(textToSpeak, detectedLang);
        };

        await audio.play();
        return;
      }
    } catch (ttsErr) {
      console.warn('[Gemini TTS unavailable, falling back to browser synthesis]:', ttsErr.message);
    }

    // 2. Fallback to client browser SpeechSynthesis
    fallbackBrowserSpeech(textToSpeak, detectedLang);
  }, [audioMuted, stopSpeaking]);

  // Browser speech synthesis fallback
  const fallbackBrowserSpeech = (cleanText, detectedLang) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceState('ready');
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Select voice based on language
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

      utterance.onend = () => setVoiceState('ready');
      utterance.onerror = () => setVoiceState('ready');

      window.speechSynthesis.speak(utterance);
    } catch {
      setVoiceState('ready');
    }
  };

  // Submit recognized question to the existing AI backend
  const submitVoiceQuery = useCallback(async (queryText) => {
    const q = (queryText || transcript).trim();
    if (!q) {
      setVoiceState('ready');
      return;
    }

    // Stop speaking any prior audio
    stopSpeaking();
    stopMicrophone();

    setVoiceState('processing');
    setErrorMessage('');
    setInterimTranscript('');

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: q
    };

    setMessages(prev => [...prev, userMsg]);
    setTranscript('');

    try {
      // Build conversation history from recent messages (max 6)
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));

      // Call existing AI Chat endpoint with authenticated user context
      const res = await axios.post(`${API_BASE_URL}/ai/chat`, {
        message: q,
        history
      });

      if (res.data?.success) {
        const assistantMsg = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: res.data.message || 'Done.',
          spokenSummary: res.data.spokenSummary || '',
          pdfReport: res.data.pdfReport || null,
          excelReport: res.data.excelReport || null
        };

        setMessages(prev => [...prev, assistantMsg]);

        // Speak the response aloud using the spoken summary
        const textToSpeak = res.data.spokenSummary || res.data.message;
        speakText(textToSpeak);
      } else {
        throw new Error(res.data?.message || 'Could not process voice request.');
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to process voice request.';
      setErrorMessage(errMsg);
      setVoiceState('ready');

      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `⚠️ **Error:** ${errMsg}`
        }
      ]);
    }
  }, [transcript, messages, stopSpeaking, stopMicrophone, speakText]);

  // Audio level visualizer for microphone wave animation
  const setupAudioVisualizer = (stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch {}
  };

  // Start microphone listening with dual engine (Browser SpeechRecognition + MediaRecorder fallback)
  const startListening = async () => {
    // If assistant is currently speaking, stop it immediately (Barge-in / Interrupt)
    stopSpeaking();
    setErrorMessage('');
    setInterimTranscript('');
    setTranscript('');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Check if Web Speech API is supported
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = false;
        recognition.interimResults = true;

        // Set recognition language
        if (languageMode === 'ur') {
          recognition.lang = 'ur-PK';
        } else if (languageMode === 'en') {
          recognition.lang = 'en-GB';
        } else {
          // Auto mode: default to ur-PK or en-GB depending on platform locale
          recognition.lang = 'ur-PK';
        }

        recognition.onstart = () => {
          setVoiceState('listening');
        };

        recognition.onresult = (event) => {
          let currentInterim = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const piece = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += piece;
            } else {
              currentInterim += piece;
            }
          }

          if (currentInterim) {
            setInterimTranscript(currentInterim);
          }
          if (finalTranscript) {
            setTranscript(finalTranscript);
            submitVoiceQuery(finalTranscript);
          }
        };

        recognition.onerror = async (event) => {
          console.warn('[SpeechRecognition Error]:', event.error);
          // If browser speech recognition failed or language was not supported, fallback to MediaRecorder + Gemini
          if (event.error === 'not-allowed') {
            setErrorMessage('Microphone access was denied. Please allow microphone permissions in your browser.');
            setVoiceState('ready');
          } else {
            // Attempt Gemini server-side speech recognition
            recognitionRef.current = null;
            startMediaRecorderFallback();
          }
        };

        recognition.onend = () => {
          if (voiceState === 'listening' && !interimTranscript && !transcript) {
            setVoiceState('ready');
          }
        };

        // Also setup audio level visualizer
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = stream;
          setupAudioVisualizer(stream);
        } catch {}

        recognition.start();
        return;
      } catch (recErr) {
        console.warn('[Web Speech API start error, using MediaRecorder fallback]:', recErr.message);
      }
    }

    // MediaRecorder + Gemini STT fallback
    startMediaRecorderFallback();
  };

  // MediaRecorder + Gemini audio transcription fallback
  const startMediaRecorderFallback = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setupAudioVisualizer(stream);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        setVoiceState('processing');
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        if (audioBlob.size < 500) {
          setErrorMessage("Recording was too short. Please try again.");
          setVoiceState('ready');
          return;
        }

        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, `speech.${mimeType === 'audio/webm' ? 'webm' : 'mp4'}`);
          formData.append('language', languageMode);

          const res = await axios.post(`${API_BASE_URL}/ai/transcribe`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });

          if (res.data?.success && res.data?.text) {
            setTranscript(res.data.text);
            submitVoiceQuery(res.data.text);
          } else {
            throw new Error(res.data?.message || 'Could not transcribe speech.');
          }
        } catch (transcribeErr) {
          setErrorMessage(transcribeErr.response?.data?.message || transcribeErr.message || 'Speech recognition failed.');
          setVoiceState('ready');
        }
      };

      recorder.start();
      setVoiceState('listening');
    } catch (micErr) {
      setErrorMessage('Microphone access is required. Please check your browser permissions.');
      setVoiceState('ready');
    }
  };

  // Stop recording button click
  const handleMicButtonClick = () => {
    if (voiceState === 'listening') {
      // User tapped mic to finish speaking
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    } else if (voiceState === 'speaking') {
      // User tapped mic while assistant was speaking: Interrupt & listen
      stopSpeaking();
      startListening();
    } else if (voiceState === 'ready') {
      startListening();
    }
  };

  // Initial trigger if modal opened with query
  useEffect(() => {
    if (isOpen && initialQuery) {
      submitVoiceQuery(initialQuery);
    }
  }, [isOpen, initialQuery, submitVoiceQuery]);

  if (!isOpen) return null;

  // Determine status text based on state
  let statusHeadline = 'How can I help you?';
  let statusSubline = 'Press the microphone and ask in Urdu, English or Roman Urdu';
  let ringColor = 'rgba(56, 189, 248, 0.4)';
  let glowEffect = '0 0 25px rgba(56, 189, 248, 0.35)';

  if (voiceState === 'listening') {
    statusHeadline = 'Listening...';
    statusSubline = interimTranscript ? `"${interimTranscript}"` : 'Aapki baat sun raha hoon... speak naturally';
    ringColor = 'rgba(34, 197, 94, 0.8)';
    glowEffect = `0 0 ${30 + volumeLevel * 0.4}px rgba(34, 197, 94, 0.6)`;
  } else if (voiceState === 'processing') {
    statusHeadline = 'Understanding your request...';
    statusSubline = 'Searching live database and calculating verified details...';
    ringColor = 'rgba(168, 85, 247, 0.8)';
    glowEffect = '0 0 35px rgba(168, 85, 247, 0.6)';
  } else if (voiceState === 'speaking') {
    statusHeadline = 'Rota Assistant is speaking...';
    statusSubline = 'Tap Stop Speaking or ask another question anytime';
    ringColor = 'rgba(14, 165, 233, 0.9)';
    glowEffect = '0 0 40px rgba(14, 165, 233, 0.7)';
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      background: 'radial-gradient(ellipse at 50% 20%, #0d1b3e 0%, #080e1e 65%, #040711 100%)',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      {/* ── TOP HEADER ────────────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(10px)',
        background: 'rgba(8, 14, 30, 0.7)',
        zIndex: 10
      }}>
        {/* Brand & Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={rotaLogo}
            alt="Rota System Logo"
            style={{
              width: '38px',
              height: '38px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 10px rgba(56, 189, 248, 0.5))'
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '0.5px', color: '#f8fafc' }}>
                ROTA VOICE ASSISTANT
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)',
                color: '#ffffff',
                textTransform: 'uppercase'
              }}>
                Urdu + English
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Smart Workforce, Attendance & Payroll Conversational AI
            </span>
          </div>
        </div>

        {/* Header Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Language Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(255, 255, 255, 0.06)',
            padding: '4px 8px',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <Globe size={14} color="#38bdf8" />
            <select
              value={languageMode}
              onChange={(e) => setLanguageMode(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#e2e8f0',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="auto" style={{ background: '#0f172a', color: '#fff' }}>Auto (Urdu + Eng)</option>
              <option value="ur" style={{ background: '#0f172a', color: '#fff' }}>اردو (Urdu)</option>
              <option value="en" style={{ background: '#0f172a', color: '#fff' }}>English</option>
            </select>
          </div>

          {/* Mute / Unmute */}
          <button
            onClick={() => {
              if (!audioMuted && voiceState === 'speaking') stopSpeaking();
              setAudioMuted(!audioMuted);
            }}
            title={audioMuted ? "Unmute Voice" : "Mute Voice"}
            style={{
              background: audioMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              border: audioMuted ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: audioMuted ? '#f87171' : '#cbd5e1',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {audioMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          {/* Close Modal */}
          <button
            onClick={handleClose}
            title="Close Voice Assistant (Esc)"
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

      {/* ── MAIN CONTENT AREA ─────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        padding: '20px 24px',
        position: 'relative',
        boxSizing: 'border-box'
      }}>
        {/* Central Visualizer & Hero Section */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 0 30px',
          textAlign: 'center'
        }}>
          {/* Animated Glowing Microphone Orb */}
          <div style={{ position: 'relative', width: '130px', height: '130px', marginBottom: '20px' }}>
            {/* Outer Pulsing Wave Ring */}
            <div style={{
              position: 'absolute',
              top: '-15px',
              left: '-15px',
              right: '-15px',
              bottom: '-15px',
              borderRadius: '50%',
              border: `2px solid ${ringColor}`,
              boxShadow: glowEffect,
              opacity: voiceState === 'listening' || voiceState === 'speaking' ? 0.8 : 0.25,
              animation: voiceState === 'listening' || voiceState === 'speaking' ? 'pulse 1.8s infinite' : 'none',
              transition: 'all 0.3s ease'
            }} />

            {/* Inner Interactive Button */}
            <button
              onClick={handleMicButtonClick}
              title={
                voiceState === 'listening'
                  ? "Tap to send speech"
                  : voiceState === 'speaking'
                  ? "Interrupt and speak"
                  : "Tap to speak"
              }
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: voiceState === 'listening'
                  ? 'linear-gradient(135deg, #15803d, #22c55e)'
                  : voiceState === 'speaking'
                  ? 'linear-gradient(135deg, #0284c7, #38bdf8)'
                  : 'linear-gradient(135deg, #1e1b4b, #312e81)',
                border: '3px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                cursor: 'pointer',
                boxShadow: glowEffect,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: voiceState === 'listening' ? `scale(${1 + volumeLevel * 0.003})` : 'scale(1)'
              }}
            >
              {voiceState === 'listening' ? (
                <Mic size={52} color="#ffffff" />
              ) : voiceState === 'speaking' ? (
                <Volume2 size={52} color="#ffffff" />
              ) : (
                <Mic size={52} color="#38bdf8" />
              )}
            </button>
          </div>

          {/* Dynamic Status Text */}
          <h2 style={{
            margin: '0 0 6px',
            fontSize: '22px',
            fontWeight: 800,
            letterSpacing: '0.3px',
            color: voiceState === 'listening' ? '#4ade80' : voiceState === 'speaking' ? '#38bdf8' : '#f8fafc'
          }}>
            {statusHeadline}
          </h2>
          <p style={{
            margin: 0,
            fontSize: '13px',
            color: '#94a3b8',
            maxWidth: '520px',
            lineHeight: 1.5
          }}>
            {statusSubline}
          </p>

          {/* INTERRUPT / STOP SPEAKING BUTTON (Prominently visible when speaking) */}
          {voiceState === 'speaking' && (
            <div style={{ marginTop: '16px' }}>
              <button
                onClick={stopSpeaking}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '24px',
                  padding: '8px 20px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(239, 68, 68, 0.5)',
                  transition: 'transform 0.15s ease'
                }}
              >
                <Square size={14} fill="#ffffff" />
                Stop Speaking
              </button>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div style={{
              marginTop: '16px',
              padding: '10px 16px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '10px',
              color: '#fca5a5',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              maxWidth: '540px'
            }}>
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* ── CONVERSATION TRANSCRIPT ─────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          maxWidth: '780px',
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          paddingBottom: '20px'
        }}>
          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  flexDirection: isUser ? 'row-reverse' : 'row'
                }}
              >
                {/* Avatar Icon */}
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: isUser ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                }}>
                  {isUser ? <User size={16} color="#fff" /> : <Bot size={16} color="#fff" />}
                </div>

                {/* Message Bubble */}
                <div style={{
                  background: isUser
                    ? 'linear-gradient(135deg, #1e3a8a, #1e40af)'
                    : 'rgba(15, 23, 42, 0.75)',
                  border: isUser
                    ? '1px solid rgba(96, 165, 250, 0.3)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                  padding: '12px 16px',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                  backdropFilter: 'blur(8px)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: isUser ? '#93c5fd' : '#c084fc' }}>
                      {isUser ? 'You' : 'Rota Assistant'}
                    </span>
                    {!isUser && m.spokenSummary && !audioMuted && (
                      <button
                        onClick={() => speakText(m.spokenSummary)}
                        title="Replay Voice Response"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#38bdf8',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '2px',
                          marginLeft: '8px'
                        }}
                      >
                        <Volume2 size={13} />
                      </button>
                    )}
                  </div>

                  <SimpleMarkdown content={m.content} />

                  {/* PDF Download Button */}
                  {m.pdfReport && (
                    <div style={{ marginTop: '10px' }}>
                      <a
                        href={`${API_BASE_URL}/ai/download-report/${m.pdfReport.token}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                          color: '#ffffff',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 700,
                          textDecoration: 'none',
                          boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)'
                        }}
                      >
                        <Download size={14} />
                        Download {m.pdfReport.fileName || 'PDF Report'}
                      </a>
                    </div>
                  )}

                  {/* Excel Download Button */}
                  {m.excelReport && (
                    <div style={{ marginTop: '10px' }}>
                      <a
                        href={`${API_BASE_URL}/ai/download-report/${m.excelReport.token}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          background: 'linear-gradient(135deg, #15803d, #22c55e)',
                          color: '#ffffff',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 700,
                          textDecoration: 'none',
                          boxShadow: '0 2px 8px rgba(34, 197, 94, 0.4)'
                        }}
                      >
                        <Download size={14} />
                        Download {m.excelReport.fileName || 'Excel Sheet'}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Real-time Interim Voice Speech Preview Bubble */}
          {voiceState === 'listening' && interimTranscript && (
            <div style={{
              display: 'flex',
              gap: '12px',
              alignSelf: 'flex-end',
              maxWidth: '85%'
            }}>
              <div style={{
                background: 'rgba(30, 58, 138, 0.5)',
                border: '1px dashed rgba(96, 165, 250, 0.6)',
                borderRadius: '16px 4px 16px 16px',
                padding: '10px 14px',
                color: '#93c5fd',
                fontSize: '13px',
                fontStyle: 'italic'
              }}>
                <span style={{ fontSize: '10px', color: '#60a5fa', display: 'block', marginBottom: '2px' }}>Listening...</span>
                "{interimTranscript}"
              </div>
            </div>
          )}

          {/* Thinking / Searching database indicator */}
          {voiceState === 'processing' && (
            <div style={{ display: 'flex', gap: '10px', alignSelf: 'flex-start', alignItems: 'center' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Sparkles size={16} color="#fff" />
              </div>
              <div style={{
                background: 'rgba(15, 23, 42, 0.75)',
                padding: '8px 14px',
                borderRadius: '12px',
                fontSize: '12px',
                color: '#c084fc',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#a855f7', animation: 'ping 1s infinite' }} />
                Checking database and calculating answer...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── FOOTER INTERACTION BAR ───────────────────────────────────────────── */}
      <footer style={{
        padding: '12px 20px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(8, 14, 30, 0.85)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 10
      }}>
        {/* Optional text input fallback */}
        {showTextInput ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (textInput.trim()) {
                submitVoiceQuery(textInput);
                setTextInput('');
              }
            }}
            style={{ display: 'flex', gap: '8px', maxWidth: '780px', width: '100%', margin: '0 auto' }}
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Or type your question in Urdu / English..."
              autoFocus
              style={{
                flex: 1,
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                padding: '10px 14px',
                color: '#ffffff',
                fontSize: '13px',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={!textInput.trim()}
              style={{
                background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                border: 'none',
                borderRadius: '10px',
                padding: '0 16px',
                color: '#ffffff',
                cursor: textInput.trim() ? 'pointer' : 'default',
                opacity: textInput.trim() ? 1 : 0.5
              }}
            >
              <Send size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowTextInput(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '0 12px',
                color: '#cbd5e1',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>
          </form>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            maxWidth: '780px',
            width: '100%',
            margin: '0 auto'
          }}>
            <button
              onClick={() => setShowTextInput(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <MessageSquare size={14} />
              Prefer to type? Click here
            </button>

            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Pixx Technologies Ltd • Voice Assistant
            </span>

            <button
              onClick={() => setMessages(messages.slice(0, 1))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={14} />
              Clear Chat
            </button>
          </div>
        )}
      </footer>

      {/* Embedded CSS animation for microphone wave pulse */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.08); opacity: 0.4; }
          100% { transform: scale(1); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
