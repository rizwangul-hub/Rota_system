import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  Sparkles,
  X,
  Send,
  RefreshCw,
  FileText,
  Download,
  ExternalLink,
  Bot,
  User,
  Trash2,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../context/AuthContext';

export default function AiAssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'w-welcome',
      role: 'assistant',
      content: '👋 Hi! Need quick details about any worker, shop, or today\'s attendance? Ask me or say **"Give me in PDF"**!'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadingToken, setDownloadingToken] = useState(null);
  const navigate = useNavigate();

  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (queryText) => {
    const query = (queryText || input).trim();
    if (!query || loading) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: query
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.slice(-4).map(m => ({ role: m.role, content: m.content }));
      const res = await axios.post(`${API_BASE_URL}/ai/chat`, { message: query, history });

      if (res.data?.success) {
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: res.data.message || 'Done.',
            pdfReport: res.data.pdfReport || null
          }
        ]);
      } else {
        throw new Error(res.data?.message || 'Error from assistant');
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `⚠️ ${err.response?.data?.message || err.message || 'Failed to get answer.'}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async (pdfReport) => {
    if (!pdfReport?.token) return;
    setDownloadingToken(pdfReport.token);
    try {
      const res = await axios.get(`${API_BASE_URL}/ai/download-report/${pdfReport.token}`, {
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfReport.fileName || 'report.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download PDF.');
    } finally {
      setDownloadingToken(null);
    }
  };

  return (
    <>
      <style>{`
        @keyframes floatAiBounce {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        @keyframes aiHaloPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.7), 0 8px 24px rgba(37, 99, 235, 0.45);
          }
          70% {
            box-shadow: 0 0 0 16px rgba(56, 189, 248, 0), 0 12px 30px rgba(37, 99, 235, 0.55);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(56, 189, 248, 0), 0 8px 24px rgba(37, 99, 235, 0.45);
          }
        }
        @keyframes sparkleTwinkle {
          0%, 100% {
            transform: rotate(0deg) scale(1);
            filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.8));
          }
          25% {
            transform: rotate(-12deg) scale(1.18);
            filter: drop-shadow(0 0 8px rgba(56, 189, 248, 1));
          }
          75% {
            transform: rotate(14deg) scale(1.08);
            filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.9));
          }
        }
        @keyframes badgeShimmer {
          0%, 100% {
            opacity: 0.95;
            transform: translateX(0);
          }
          50% {
            opacity: 1;
            transform: translateX(-3px);
          }
        }
        .ai-floating-btn {
          animation: floatAiBounce 3s ease-in-out infinite, aiHaloPulse 2.5s infinite;
        }
        .ai-floating-btn:hover {
          animation-play-state: paused;
          transform: scale(1.12) !important;
        }
        .ai-sparkle-icon {
          animation: sparkleTwinkle 2s ease-in-out infinite;
        }
      `}</style>

      {/* Floating Trigger Button with Moving Animation */}
      {!isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 9998
        }}>
          {/* Animated Mini Badge Pill */}
          <div
            onClick={() => setIsOpen(true)}
            style={{
              background: '#0f172a',
              color: '#38bdf8',
              fontSize: '12px',
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              userSelect: 'none',
              animation: 'badgeShimmer 2.5s ease-in-out infinite'
            }}
          >
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px #10b981',
              display: 'inline-block'
            }} />
            Ask AI
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            title="Open AI Rota Assistant"
            aria-label="Open AI Rota Assistant"
            className="ai-floating-btn"
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 50%, #4f46e5 100%)',
              color: '#ffffff',
              border: '2px solid rgba(255,255,255,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            <div className="ai-sparkle-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={25} color="#ffffff" />
            </div>
          </button>
        </div>
      )}

      {/* Slide-over Assistant Drawer / Popup */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '380px',
          height: '540px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 48px)',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9999,
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Sparkles size={16} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800 }}>AI Rota Assistant</div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>Live Workforce & PDF Helper</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/ai-assistant');
                }}
                title="Expand to Full Page"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  padding: '4px',
                  cursor: 'pointer',
                  display: 'flex'
                }}
              >
                <Maximize2 size={16} />
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  padding: '4px',
                  cursor: 'pointer',
                  display: 'flex'
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div style={{
            padding: '6px 12px',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            fontSize: '11px'
          }}>
            {[
              "Today's attendance in PDF",
              "Weekly payroll summary",
              "Who arrived late today?",
              "Shiva attendance details"
            ].map((pText, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSend(pText)}
                style={{
                  whiteSpace: 'nowrap',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {pText}
              </button>
            ))}
          </div>

          {/* Messages Container */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            backgroundColor: '#f8fafc'
          }}>
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div style={{
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: isUser ? '14px 14px 2px 14px' : '2px 14px 14px 14px',
                    backgroundColor: isUser ? '#2563eb' : '#ffffff',
                    color: isUser ? '#ffffff' : '#0f172a',
                    border: isUser ? 'none' : '1px solid #e2e8f0',
                    fontSize: '12px',
                    lineHeight: 1.4,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>

                    {m.pdfReport && (
                      <div style={{
                        marginTop: '8px',
                        padding: '8px 10px',
                        backgroundColor: '#eff6ff',
                        borderRadius: '8px',
                        border: '1px solid #bfdbfe',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileText size={16} color="#dc2626" />
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e40af' }}>
                            PDF Ready
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(m.pdfReport)}
                          disabled={downloadingToken === m.pdfReport.token}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Download size={12} />
                          <span>{downloadingToken === m.pdfReport.token ? '...' : 'Download'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '11px', padding: '6px' }}>
                <RefreshCw size={12} className="spin" color="#2563eb" />
                <span>Searching database...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Input Bar */}
          <div style={{
            padding: '10px 12px',
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            gap: '8px'
          }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask question or say 'in PDF'..."
              disabled={loading}
              style={{
                flex: 1,
                height: '36px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                outline: 'none'
              }}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: !input.trim() || loading ? '#cbd5e1' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: !input.trim() || loading ? 'not-allowed' : 'pointer'
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
