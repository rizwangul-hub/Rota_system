import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  X,
  Download,
  FileText,
  Clock,
  RefreshCw,
  Calendar,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Share2
} from 'lucide-react';

export default function TimingSheetModal({ isOpen, onClose, initialDate }) {
  const [selectedDate, setSelectedDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    if (isOpen) {
      const d = initialDate || new Date().toISOString().split('T')[0];
      setSelectedDate(d);
      fetchTimingSheet(d);
    }
  }, [isOpen, initialDate]);

  const fetchTimingSheet = async (dateStr) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.get('/reports/timing-sheet', {
        params: { date: dateStr }
      });
      if (res.data && res.data.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Error fetching timing sheet:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to load timing sheet data.');
    } finally {
      setLoading(false);
    }
  };

  const handleWeekChange = (offsetDays) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + offsetDays);
    const newDateStr = current.toISOString().split('T')[0];
    setSelectedDate(newDateStr);
    fetchTimingSheet(newDateStr);
  };

  const handleDownload = async (format) => {
    const isExcel = format === 'excel';
    const ext = isExcel ? 'xlsx' : 'pdf';
    const mime = isExcel
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
    const filename = `Timing_UK_Sales_Staff_${(data?.weekLabel || 'Week').replace(/[\/–\s]/g, '_')}.${ext}`;

    setDownloading(format);
    setErrorMsg('');
    try {
      const res = await api.get(`/reports/timing-sheet/${format}`, {
        params: { date: selectedDate },
        responseType: 'blob'
      });

      const contentType = res.headers?.['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        const errJson = JSON.parse(text);
        throw new Error(errJson.message || `Error downloading ${format.toUpperCase()}.`);
      }

      const blob = new Blob([res.data], { type: mime });

      // Mobile share sheet if supported
      if (!isExcel && typeof navigator !== 'undefined' && navigator.canShare) {
        try {
          const file = new File([blob], filename, { type: mime });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `Timing UK Sales Staff (${data?.weekLabel || ''})`,
              files: [file]
            });
            return;
          }
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') return;
        }
      }

      // Browser download fallback
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 1500);
    } catch (err) {
      console.error('Download timing sheet error:', err);
      setErrorMsg(err.message || `Failed to download ${format.toUpperCase()}.`);
    } finally {
      setDownloading('');
    }
  };

  if (!isOpen) return null;

  const totalWorkers = data?.shops?.reduce((acc, s) => acc + (s.workers?.length || 0), 0) || 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '1200px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          border: '1px solid #cbd5e1'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            background: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            borderBottom: '3px solid #eab308'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#ca8a04',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff'
              }}
            >
              <Clock size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#f8fafc' }}>
                  Timing UK Sales Staff
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: '#fef08a',
                    color: '#854d0e'
                  }}
                >
                  Weekly Arrival Times
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                Verified arrival clock-ins &amp; deduction records
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Week navigation */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: '#1e293b',
                padding: '4px 8px',
                borderRadius: '8px',
                border: '1px solid #334155'
              }}
            >
              <button
                type="button"
                onClick={() => handleWeekChange(-7)}
                disabled={loading}
                title="Previous Week"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex'
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9', padding: '0 6px' }}>
                {data?.weekLabel || 'Loading...'}
              </span>
              <button
                type="button"
                onClick={() => handleWeekChange(7)}
                disabled={loading}
                title="Next Week"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex'
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Export Buttons */}
            <button
              type="button"
              onClick={() => handleDownload('excel')}
              disabled={loading || downloading === 'excel'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                background: '#15803d',
                color: '#ffffff',
                border: 'none',
                cursor: downloading === 'excel' ? 'wait' : 'pointer'
              }}
            >
              <Download size={14} />
              <span>{downloading === 'excel' ? 'Excel...' : 'Excel (.xlsx)'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownload('pdf')}
              disabled={loading || downloading === 'pdf'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                cursor: downloading === 'pdf' ? 'wait' : 'pointer'
              }}
            >
              <FileText size={14} />
              <span>{downloading === 'pdf' ? 'PDF...' : 'PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                marginLeft: '6px'
              }}
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div
          style={{
            padding: '10px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '12px'
          }}
        >
          <div style={{ display: 'flex', gap: '16px', color: '#475569' }}>
            <span>
              Total Shops: <strong style={{ color: '#0f172a' }}>{data?.shops?.length || 0}</strong>
            </span>
            <span>
              Active Staff: <strong style={{ color: '#2563eb' }}>{totalWorkers}</strong>
            </span>
            <span>
              Verified by: <strong style={{ color: '#ca8a04' }}>Sarfraz &amp; Operators</strong>
            </span>
          </div>
          <div style={{ color: '#64748b', fontSize: '11px' }}>
            Red text indicates deductions, remarks (e.g. Boss van), or OFF days.
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#f1f5f9' }}>
          {errorMsg && (
            <div
              style={{
                padding: '10px 14px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#b91c1c',
                fontSize: '13px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px' }} />
              <div>Loading weekly timing sheet...</div>
            </div>
          ) : !data || !data.shops || data.shops.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: '#ffffff',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                color: '#64748b'
              }}
            >
              <Calendar size={32} style={{ margin: '0 auto 10px', color: '#94a3b8' }} />
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#334155' }}>
                No attendance records found for this week
              </div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>
                Try selecting another week using the buttons above.
              </div>
            </div>
          ) : (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #94a3b8',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '800px' }}>
                  <thead>
                    {/* Sheet Header */}
                    <tr style={{ background: '#ffffff', borderBottom: '1px solid #94a3b8' }}>
                      <th colSpan={8} style={{ padding: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e1b4b' }}>
                          Timing UK Sales Staff
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#334155',
                            textDecoration: 'underline',
                            marginTop: '2px'
                          }}
                        >
                          {data.weekLabel}
                        </div>
                      </th>
                    </tr>

                    {/* Day Dates */}
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                      <th
                        style={{
                          padding: '6px 10px',
                          textAlign: 'center',
                          fontWeight: 700,
                          borderRight: '1px solid #94a3b8',
                          width: '140px',
                          color: '#0f172a'
                        }}
                      >
                        Shop
                      </th>
                      {(data.days || []).map((day, dIdx) => (
                        <th
                          key={dIdx}
                          style={{
                            padding: '6px 8px',
                            textAlign: 'center',
                            fontWeight: 600,
                            borderRight: '1px solid #cbd5e1',
                            color: '#334155'
                          }}
                        >
                          {day.dateStr}
                        </th>
                      ))}
                    </tr>

                    {/* Day Names */}
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #0f172a' }}>
                      <th style={{ padding: '4px', borderRight: '1px solid #94a3b8' }}></th>
                      {(data.days || []).map((day, dIdx) => (
                        <th
                          key={dIdx}
                          style={{
                            padding: '4px 8px',
                            textAlign: 'center',
                            fontWeight: 700,
                            borderRight: '1px solid #cbd5e1',
                            fontSize: '12px',
                            color: '#0f172a'
                          }}
                        >
                          {day.dayName}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {data.shops.map((shop, sIdx) => (
                      <React.Fragment key={sIdx}>
                        {/* Bright Yellow Banner for Shop */}
                        <tr style={{ background: '#ffff00', borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8' }}>
                          <td
                            colSpan={8}
                            style={{
                              padding: '5px 12px',
                              textAlign: 'center',
                              fontWeight: 800,
                              fontSize: '13px',
                              color: '#000000',
                              letterSpacing: '0.3px'
                            }}
                          >
                            {shop.shopName}
                          </td>
                        </tr>

                        {/* Workers */}
                        {shop.workers.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              style={{
                                padding: '6px 12px',
                                textAlign: 'center',
                                color: '#94a3b8',
                                fontStyle: 'italic',
                                fontSize: '11px',
                                borderBottom: '1px solid #e2e8f0'
                              }}
                            >
                              No staff assigned or logged at this shop for this week
                            </td>
                          </tr>
                        ) : (
                          shop.workers.map((worker, wIdx) => (
                            <tr
                              key={wIdx}
                              style={{
                                background: wIdx % 2 === 0 ? '#ffffff' : '#fafafa',
                                borderBottom: '1px solid #cbd5e1'
                              }}
                            >
                              {/* Worker Name in Italic */}
                              <td
                                style={{
                                  padding: '6px 10px',
                                  fontStyle: 'italic',
                                  fontWeight: 600,
                                  color: '#0f172a',
                                  borderRight: '1px solid #94a3b8',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {worker.workerName}
                              </td>

                              {/* 7 Daily Arrival cells */}
                              {worker.days.map((cell, cIdx) => {
                                const isAlert = cell.isAlert;
                                return (
                                  <td
                                    key={cIdx}
                                    style={{
                                      padding: '6px 6px',
                                      textAlign: 'center',
                                      borderRight: '1px solid #cbd5e1',
                                      fontWeight: isAlert ? 700 : 500,
                                      color: isAlert ? '#dc2626' : (cell.text ? '#0f172a' : '#cbd5e1'),
                                      fontSize: '10.5px',
                                      background: cell.text === 'OFF' ? '#fef2f2' : (isAlert ? '#fff1f2' : 'transparent'),
                                      lineHeight: 1.25
                                    }}
                                  >
                                    {cell.text || '—'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Official Rota Timesheet &bull; Pixx Rota System
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              color: '#334155'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
