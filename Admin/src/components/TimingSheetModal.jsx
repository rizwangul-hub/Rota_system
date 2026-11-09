import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { downloadReportFile } from '../utils/downloadReportFile';
import {
  X, Download, FileText, Clock, RefreshCw, Calendar, AlertCircle, ChevronLeft, ChevronRight
} from 'lucide-react';

export default function TimingSheetModal({ isOpen, onClose, initialDate }) {
  const [selectedDate, setSelectedDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialDate) setSelectedDate(initialDate);
      fetchTimingSheet(initialDate || selectedDate);
    }
  }, [isOpen, initialDate]);

  const fetchTimingSheet = async (dateStr) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await axios.get(`${API_BASE_URL}/reports/timing-sheet`, {
        params: { date: dateStr }
      });
      if (res.data.success) {
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
    const filename = `Timing_UK_Sales_Staff_${(data?.weekLabel || 'Week').replace(/[\/–\s]/g, '_')}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    setDownloading(format);
    setErrorMsg('');
    try {
      await downloadReportFile(`/reports/timing-sheet/${format}`, { date: selectedDate }, filename);
    } catch (err) {
      setErrorMsg(err.message || `Unable to download ${format.toUpperCase()}`);
    } finally {
      setDownloading('');
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '1240px',
        maxHeight: '94vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(to right, #fef08a, #fef9c3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: '#ca8a04',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff'
            }}>
              <Clock size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#854d0e', letterSpacing: '-0.02em' }}>
                Timing UK Sales Staff
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#a16207', fontWeight: 600 }}>
                Weekly Worker Arrival Times, Deductions & Shifts
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => handleDownload('pdf')}
              disabled={loading || downloading === 'pdf'}
              className="btn btn-sm"
              style={{
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <FileText size={15} />
              {downloading === 'pdf' ? 'Generating PDF…' : 'Download PDF'}
            </button>

            <button
              onClick={() => handleDownload('excel')}
              disabled={loading || downloading === 'excel'}
              className="btn btn-sm"
              style={{
                backgroundColor: '#16a34a',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Download size={15} />
              {downloading === 'excel' ? 'Exporting Excel…' : 'Download Excel'}
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#854d0e',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex'
              }}
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Toolbar: Week Selector & KPI Summary */}
        <div style={{
          padding: '12px 24px',
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Week navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => handleWeekChange(-7)}
              className="btn btn-outline btn-sm"
              title="Previous Week"
              style={{ padding: '4px 8px' }}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{
              backgroundColor: '#ffffff',
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontWeight: 700,
              fontSize: '13px',
              color: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Calendar size={15} color="#ca8a04" />
              <span>{data?.weekLabel || 'Loading week…'}</span>
            </div>
            <button
              onClick={() => handleWeekChange(7)}
              className="btn btn-outline btn-sm"
              title="Next Week"
              style={{ padding: '4px 8px' }}
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                setSelectedDate(today);
                fetchTimingSheet(today);
              }}
              className="btn btn-outline btn-sm"
              style={{ fontSize: '11px', fontWeight: 600 }}
            >
              This Week
            </button>
          </div>

          {/* Quick Metrics */}
          {data?.summary && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '12px', color: '#475569' }}>
                Shops: <strong style={{ color: '#0f172a' }}>{data.summary.totalShops}</strong>
              </div>
              <div style={{ fontSize: '12px', color: '#475569' }}>
                Workers: <strong style={{ color: '#0f172a' }}>{data.summary.totalWorkers}</strong>
              </div>
              <div style={{ fontSize: '12px', color: '#475569' }}>
                Arrivals Logged: <strong style={{ color: '#16a34a' }}>{data.summary.totalLogs}</strong>
              </div>
              {data.summary.totalAlerts > 0 && (
                <div style={{
                  fontSize: '12px',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 700
                }}>
                  {data.summary.totalAlerts} Deductions / Alerts
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Body / Scrollable Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div style={{
              backgroundColor: '#fee2e2',
              color: '#b91c1c',
              padding: '10px 16px',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={32} className="spin" style={{ margin: '0 auto 12px' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>Loading timing sheet for {data?.weekLabel || 'week'}…</p>
            </div>
          ) : !data || !data.shopsData?.length ? (
            <div style={{
              padding: '60px 20px',
              textAlign: 'center',
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px dashed #cbd5e1'
            }}>
              <Clock size={40} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
              <h4 style={{ margin: '0 0 6px', color: '#334155', fontWeight: 700 }}>No Attendance Logged For This Week</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Worker arrival times appear here automatically as soon as attendance is logged or approved.
              </p>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid #cbd5e1',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              {/* Document Banner inside table preview */}
              <div style={{
                textAlign: 'center',
                padding: '14px 10px',
                borderBottom: '2px solid #0f172a',
                backgroundColor: '#ffffff'
              }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.01em' }}>
                  Timing UK Sales Staff
                </h3>
                <div style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                  {data.week?.formattedStartDate ? `${data.week.formattedStartDate.replace(/\//g, '-')}  to  ${data.week.formattedEndDate.replace(/\//g, '-')}` : data.weekLabel}
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '12px' }}>
                  <thead>
                    {/* Header Row 1: Shop & Dates */}
                    <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #cbd5e1' }}>
                      <th rowSpan={2} style={{
                        padding: '10px 14px',
                        fontWeight: 800,
                        color: '#0f172a',
                        borderRight: '1px solid #cbd5e1',
                        borderBottom: '1px solid #cbd5e1',
                        width: '180px',
                        verticalAlign: 'middle',
                        backgroundColor: '#f8fafc'
                      }}>
                        Shop
                      </th>
                      {data.dates.map((d, i) => (
                        <th key={i} style={{
                          padding: '6px 8px',
                          fontWeight: 700,
                          color: '#1e293b',
                          borderRight: i < 6 ? '1px solid #cbd5e1' : 'none',
                          borderBottom: '1px solid #cbd5e1',
                          backgroundColor: '#f8fafc',
                          fontSize: '11px'
                        }}>
                          {d.formattedDate}
                        </th>
                      ))}
                    </tr>
                    {/* Header Row 2: Day Names */}
                    <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #94a3b8' }}>
                      {data.dates.map((d, i) => (
                        <th key={i} style={{
                          padding: '6px 8px',
                          fontWeight: 800,
                          color: '#0f172a',
                          borderRight: i < 6 ? '1px solid #cbd5e1' : 'none',
                          borderBottom: '2px solid #94a3b8',
                          fontSize: '11.5px'
                        }}>
                          {d.dayName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.shopsData.map((shop, sIdx) => (
                      <React.Fragment key={shop.shopId || sIdx}>
                        {/* Shop Header Row (Pure Bright Yellow banner) */}
                        <tr style={{ backgroundColor: '#ffff00', borderTop: '2px solid #94a3b8', borderBottom: '1px solid #94a3b8' }}>
                          <td colSpan={8} style={{
                            padding: '8px 16px',
                            fontWeight: 800,
                            fontSize: '13px',
                            color: '#000000',
                            textAlign: 'center',
                            letterSpacing: '0.02em',
                            textTransform: 'none'
                          }}>
                            {shop.shopName}
                          </td>
                        </tr>

                        {/* Workers under Shop */}
                        {shop.workers.map((worker, wIdx) => (
                          <tr
                            key={worker.employeeId || wIdx}
                            style={{
                              backgroundColor: wIdx % 2 === 0 ? '#ffffff' : '#fcfcfc',
                              borderBottom: '1px solid #e2e8f0'
                            }}
                          >
                            {/* Worker Name (Bold Italic) */}
                            <td style={{
                              padding: '8px 14px',
                              fontWeight: 700,
                              fontStyle: 'italic',
                              color: '#000000',
                              textAlign: 'left',
                              borderRight: '1px solid #cbd5e1',
                              whiteSpace: 'nowrap'
                            }}>
                              {worker.employeeName}
                            </td>

                            {/* 7 Days Arrival Times */}
                            {worker.days.map((cell, dIdx) => (
                              <td
                                key={dIdx}
                                style={{
                                  padding: '8px 6px',
                                  borderRight: dIdx < 6 ? '1px solid #cbd5e1' : 'none',
                                  color: cell.isAlert ? '#dc2626' : '#000000',
                                  fontWeight: cell.isAlert ? 800 : 500,
                                  fontSize: cell.isAlert ? '11px' : '11.5px',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {cell.text || ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
