import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Sparkles,
  Send,
  Trash2,
  RefreshCw,
  FileText,
  FileSpreadsheet,
  Download,
  User,
  Building2,
  Calendar,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Bot,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { API_BASE_URL } from '../context/AuthContext';

const SUGGESTED_PROMPTS = [
  { text: "Give me Shiva's attendance in PDF", icon: FileText, tag: 'PDF Report' },
  { text: "Export today's attendance to Excel", icon: FileSpreadsheet, tag: 'Excel Export' },
  { text: "Show unverified attendance queue", icon: Clock, tag: 'Verification' },
  { text: "Show me Qasim's wage and profile details", icon: User, tag: 'Worker' },
  { text: "Who worked at Camden shop yesterday?", icon: Building2, tag: 'Shop' },
  { text: "Who arrived late on 2026-11-05?", icon: Clock, tag: 'Attendance' },
  { text: "Total weekly salary breakdown for all staff", icon: DollarSign, tag: 'Payroll' },
  { text: "Show me all active shops and assigned workers", icon: Building2, tag: 'Directory' }
];

/**
 * Lightweight, robust Markdown and Table Renderer
 */
function MarkdownRenderer({ content }) {
  if (!content || typeof content !== 'string') return null;

  const lines = content.split('\n');
  const elements = [];
  let currentTable = null;
  let currentList = null;

  const flushTable = () => {
    if (currentTable && Array.isArray(currentTable.rows) && currentTable.rows.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} style={{
          margin: '12px 0',
          overflowX: 'auto',
          borderRadius: '10px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            {currentTable.headers && (
              <thead style={{ backgroundColor: '#0f172a', color: '#f8fafc', fontWeight: 700 }}>
                <tr>
                  {currentTable.headers.map((h, i) => (
                    <th key={i} style={{ padding: '8px 12px', borderRight: '1px solid #334155', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody style={{ backgroundColor: '#ffffff' }}>
              {currentTable.rows.map((row, rIdx) => (
                <tr key={rIdx} style={{
                  backgroundColor: rIdx % 2 === 0 ? '#ffffff' : '#f8fafc',
                  borderTop: '1px solid #e2e8f0'
                }}>
                  {Array.isArray(row) && row.map((cell, cIdx) => (
                    <td key={cIdx} style={{
                      padding: '7px 12px',
                      color: '#1e293b',
                      borderRight: '1px solid #e2e8f0',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatInlineMarkdown(cell)}
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

  const flushList = () => {
    if (currentList && currentList.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '13px', color: '#334155' }}>
          {currentList.map((item, idx) => (
            <li key={idx} style={{ marginBottom: '4px' }}>{formatInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Markdown Table Row
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => c.trim());

      const isSeparator = cells.every(c => /^:?-+:?$/.test(c));

      if (isSeparator) {
        continue;
      }

      if (!currentTable) {
        flushList();
        currentTable = { headers: cells, rows: [] };
      } else {
        currentTable.rows.push(cells);
      }
      continue;
    } else {
      flushTable();
    }

    // Markdown List item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!currentList) currentList = [];
      currentList.push(trimmed.slice(2));
      continue;
    } else {
      flushList();
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={i} style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: '12px 0 6px' }}>
          {formatInlineMarkdown(trimmed.slice(4))}
        </h3>
      );
      continue;
    }
    if (trimmed.startsWith('#### ')) {
      elements.push(
        <h4 key={i} style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', margin: '10px 0 4px' }}>
          {formatInlineMarkdown(trimmed.slice(5))}
        </h4>
      );
      continue;
    }

    // Horizontal Rule
    if (/^_{3,}$|^-{3,}$|^\*{3,}$/.test(trimmed)) {
      elements.push(<hr key={i} style={{ margin: '14px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      elements.push(
        <div key={i} style={{
          borderLeft: '3px solid #3b82f6',
          backgroundColor: '#eff6ff',
          padding: '6px 12px',
          margin: '6px 0',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#1e40af'
        }}>
          {formatInlineMarkdown(trimmed.slice(2))}
        </div>
      );
      continue;
    }

    // Empty line
    if (!trimmed) {
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} style={{ margin: '4px 0', fontSize: '13px', lineHeight: 1.5, color: '#1e293b' }}>
        {formatInlineMarkdown(trimmed)}
      </p>
    );
  }

  flushTable();
  flushList();

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{elements}</div>;
}

function formatInlineMarkdown(text) {
  if (typeof text !== 'string') return text;

  // Split by bold (**text**)
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} style={{ color: '#0f172a' }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function AiRotaAssistantPage() {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: `👋 **Hello! I am your AI Workforce & Finance Assistant for the Pixx Rota System.**\n\nI can answer questions and generate official PDF reports about:\n- **Any Worker**: Attendance history, arrival & departure times, hours, daily wages, deductions, and loan balances.\n- **Any Shop**: Daily attendance, staffing coverage, assigned staff, weekly rota schedule, and shop labour costs.\n- **Any Day / Date**: Complete daily attendance summary, who was late or absent, hours logged, and manager approval status.\n- **Instant PDF Reports**: Ask for any report **"in PDF"** (e.g. *"Give me Shiva's attendance in PDF"*) and I will generate and download it immediately.\n\nHow can I help you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadingToken, setDownloadingToken] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const historyPayload = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await axios.post(`${API_BASE_URL}/ai/chat`, {
        message: query,
        history: historyPayload
      });

      if (res.data?.success) {
        const botMsg = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: res.data.message || 'No response details provided.',
          pdfReport: res.data.pdfReport || null,
          engine: res.data.engine || 'pixx-ai',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, botMsg]);
      } else {
        throw new Error(res.data?.message || 'Failed to get answer from AI Assistant');
      }
    } catch (err) {
      console.error('[AI Chat Error]:', err);
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ **Unable to complete request:** ${err.response?.data?.message || err.message || 'Please check connection and retry.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
      link.download = pdfReport.fileName || 'Pixx_Report.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download PDF. The file may have expired.');
    } finally {
      setDownloadingToken(null);
    }
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearChat = () => {
    if (window.confirm('Are you sure you want to clear the chat history?')) {
      setMessages([
        {
          id: 'welcome-reset',
          role: 'assistant',
          content: 'Chat cleared. Ask me any question about workers, shops, attendance, salaries, or ask for a PDF report!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 64px)',
      backgroundColor: '#f8fafc',
      position: 'relative'
    }}>
      {/* Top Banner / Header (Compact to maximize chat screen space) */}
      <div style={{
        padding: '7px 16px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
            flexShrink: 0
          }}>
            <Sparkles size={15} color="#ffffff" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
            <h1 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0, whiteSpace: 'nowrap' }}>
              AI Workforce & Finance Assistant
            </h1>
            <span style={{
              backgroundColor: '#dcfce7',
              color: '#15803d',
              fontSize: '10px',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '4px',
              whiteSpace: 'nowrap'
            }}>
              Live Database Active
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
              • Instant answers & official PDF / Excel reports
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setShowSuggestions(!showSuggestions)}
            title={showSuggestions ? 'Hide suggested questions' : 'Show suggested questions'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              borderRadius: '6px',
              backgroundColor: showSuggestions ? '#f8fafc' : '#eff6ff',
              border: showSuggestions ? '1px solid #cbd5e1' : '1px solid #bfdbfe',
              color: showSuggestions ? '#475569' : '#1d4ed8',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {showSuggestions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <span>{showSuggestions ? 'Hide Prompts' : 'Prompts'}</span>
          </button>

          <button
            type="button"
            onClick={handleClearChat}
            title="Clear chat history"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              borderRadius: '6px',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#475569',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Trash2 size={13} />
            <span>Clear Chat</span>
          </button>
        </div>
      </div>

      {/* Suggested Questions Pills (Compact & Collapsible) */}
      {showSuggestions && (
        <div style={{
          padding: '4px 16px',
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          flexShrink: 0
        }}>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>
            Suggested:
          </span>
          {SUGGESTED_PROMPTS.map((p, idx) => {
            const Icon = p.icon;
            return (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => handleSend(p.text)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 10px',
                  borderRadius: '14px',
                  backgroundColor: p.tag === 'PDF Report' ? '#eff6ff' : '#ffffff',
                  border: p.tag === 'PDF Report' ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                  color: p.tag === 'PDF Report' ? '#1d4ed8' : '#334155',
                  fontSize: '11px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
              >
                <Icon size={11} color={p.tag === 'PDF Report' ? '#2563eb' : '#64748b'} />
                <span>{p.text}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Messages Stream */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '14px 18px',
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
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                width: '100%'
              }}
            >
              <div style={{
                display: 'flex',
                gap: '10px',
                maxWidth: isUser ? '75%' : '85%',
                alignItems: 'flex-start'
              }}>
                {!isUser && (
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    backgroundColor: '#1e3a8a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    flexShrink: 0,
                    marginTop: '2px',
                    boxShadow: '0 2px 6px rgba(30,58,138,0.3)'
                  }}>
                    <Bot size={18} />
                  </div>
                )}

                <div style={{
                  backgroundColor: isUser ? '#2563eb' : '#ffffff',
                  color: isUser ? '#ffffff' : '#0f172a',
                  padding: '14px 18px',
                  borderRadius: isUser ? '16px 16px 2px 16px' : '2px 16px 16px 16px',
                  border: isUser ? 'none' : '1px solid #e2e8f0',
                  boxShadow: isUser ? '0 4px 12px rgba(37,99,235,0.2)' : '0 2px 6px rgba(0,0,0,0.04)',
                  position: 'relative'
                }}>
                  {isUser ? (
                    <div style={{ fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {m.content}
                    </div>
                  ) : (
                    <div>
                      <MarkdownRenderer content={m.content} />

                      {/* PDF Report Download Card */}
                      {m.pdfReport && (
                        <div style={{
                          marginTop: '14px',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          backgroundColor: '#eff6ff',
                          border: '1.5px solid #bfdbfe',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          boxShadow: '0 2px 8px rgba(37,99,235,0.08)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              backgroundColor: '#fee2e2',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <FileText size={20} color="#dc2626" />
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>
                                {m.pdfReport.title || 'Official PDF Report'}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                {m.pdfReport.fileName || 'report.pdf'} • Click below to download
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(m.pdfReport)}
                            disabled={downloadingToken === m.pdfReport.token}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              backgroundColor: '#2563eb',
                              color: '#ffffff',
                              padding: '8px 14px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: downloadingToken === m.pdfReport.token ? 'wait' : 'pointer',
                              border: 'none',
                              boxShadow: '0 2px 6px rgba(37,99,235,0.3)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {downloadingToken === m.pdfReport.token ? (
                              <>
                                <RefreshCw size={14} className="spin" />
                                <span>Downloading...</span>
                              </>
                            ) : (
                              <>
                                <Download size={14} />
                                <span>Download PDF</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {m.excelReport && (
                        <div style={{
                          marginTop: '12px',
                          padding: '12px 16px',
                          backgroundColor: '#f0fdf4',
                          border: '1.5px solid #86efac',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          flexWrap: 'wrap'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              backgroundColor: '#dcfce7',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#16a34a'
                            }}>
                              <FileSpreadsheet size={20} />
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>
                                {m.excelReport.title || 'Official Excel Spreadsheet'}
                              </div>
                              <div style={{ fontSize: '11px', color: '#15803d' }}>
                                {m.excelReport.fileName}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(m.excelReport)}
                            disabled={downloadingToken === m.excelReport.token}
                            style={{
                              backgroundColor: '#16a34a',
                              color: '#ffffff',
                              padding: '8px 14px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: downloadingToken === m.excelReport.token ? 'wait' : 'pointer',
                              border: 'none',
                              boxShadow: '0 2px 6px rgba(22,163,74,0.3)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {downloadingToken === m.excelReport.token ? (
                              <>
                                <RefreshCw size={14} className="spin" />
                                <span>Downloading...</span>
                              </>
                            ) : (
                              <>
                                <Download size={14} />
                                <span>Download Excel</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Bot Message Footer */}
                      <div style={{
                        marginTop: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '6px',
                        borderTop: '1px solid #f1f5f9'
                      }}>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {m.engine ? `Engine: ${m.engine}` : 'Verified Database Record'}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleCopy(m.id, m.content)}
                            title="Copy response"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px'
                            }}
                          >
                            {copiedId === m.id ? <Check size={12} color="#15803d" /> : <Copy size={12} />}
                            <span>{copiedId === m.id ? 'Copied' : 'Copy'}</span>
                          </button>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{m.timestamp}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    backgroundColor: '#e0e7ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#3730a3',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}>
                    <User size={18} />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              backgroundColor: '#1e3a8a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              flexShrink: 0
            }}>
              <Bot size={18} />
            </div>
            <div style={{
              backgroundColor: '#ffffff',
              padding: '12px 18px',
              borderRadius: '2px 16px 16px 16px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#64748b',
              fontSize: '13px',
              fontWeight: 600
            }}>
              <RefreshCw size={16} className="spin" color="#2563eb" />
              <span>Querying live database & generating answer...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div style={{
        padding: '9px 18px',
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexShrink: 0
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about any worker, shop, or date, or say 'Give me in PDF'..."
          disabled={loading}
          style={{
            flex: 1,
            height: '40px',
            padding: '0 14px',
            borderRadius: '10px',
            border: '1.5px solid #cbd5e1',
            fontSize: '13.5px',
            outline: 'none',
            backgroundColor: '#f8fafc',
            color: '#0f172a'
          }}
        />

        <button
          type="button"
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          style={{
            height: '40px',
            padding: '0 16px',
            borderRadius: '10px',
            backgroundColor: !input.trim() || loading ? '#94a3b8' : '#2563eb',
            color: '#ffffff',
            border: 'none',
            fontSize: '13.5px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
            boxShadow: !input.trim() || loading ? 'none' : '0 2px 8px rgba(37,99,235,0.25)',
            transition: 'background-color 0.15s ease'
          }}
        >
          {loading ? (
            <RefreshCw size={16} className="spin" />
          ) : (
            <>
              <span>Assistant</span>
              <Send size={15} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
