import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle, AlertTriangle, ArrowRight, Calendar, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Copy, Download, GripVertical, Maximize2,
  Minimize2, Move, Plus, Printer, RefreshCw, Save, Trash2, UserCheck,
  UserX, Users, X
} from 'lucide-react';
import { API_BASE_URL } from '../context/AuthContext';
import './WeeklyRotaPlanner.css';

const API = `${API_BASE_URL}/rota`;

// Shop Colors & Brand Styling
const SHOP_COLORS = {
  Station: { name: 'Station Cycles', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', pillBg: '#ede9fe', text: '#6d28d9' },
  Camden: { name: 'Camden Cycles', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', pillBg: '#ffedd5', text: '#c2410c' },
  Chelsea: { name: 'Chelsea Bikes', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', pillBg: '#e0f2fe', text: '#0369a1' },
  Edgware: { name: 'Edgware Cycles', color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4', pillBg: '#ccfbf1', text: '#0f766e' },
  Southwark: { name: 'Southwark Cycles', color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe', pillBg: '#e0e7ff', text: '#4338ca' },
  Leebridge: { name: 'Leebridge Cycles', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', pillBg: '#dcfce7', text: '#15803d' },
  Leabridge: { name: 'Leebridge Cycles', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', pillBg: '#dcfce7', text: '#15803d' }
};

function getShopStyle(shopName = '') {
  for (const [key, val] of Object.entries(SHOP_COLORS)) {
    if (shopName.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return { name: shopName, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', pillBg: '#dbeafe', text: '#1d4ed8' };
}

// Helpers for dates
const WEEKDAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function getSundayOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const day = d.getUTCDay(); // 0 is Sunday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function getWeekDates(sundayStr) {
  const dates = [];
  const base = new Date(`${sundayStr}T12:00:00.000Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    const dateKey = d.toISOString().slice(0, 10);
    const dayIndex = d.getUTCDay();
    const dayName = WEEKDAY_NAMES[dayIndex];
    const dateFormatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
    const fullDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    dates.push({ dateKey, dayIndex, dayName, dateFormatted, fullDate });
  }
  return dates;
}

export default function WeeklyRotaPlanner() {
  const [weekStart, setWeekStart] = useState(() => getSundayOf(new Date().toISOString().slice(0, 10)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Fullscreen & Pick/Drop Modes
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState('GRID'); // 'GRID' (Weekly matrix) or 'BOARD' (Daily drag & drop board)
  const [selectedDailyDate, setSelectedDailyDate] = useState(() => weekStart);

  // Pick & Drop active state: { employeeId, sourceShopId, dateKey, employeeName, sourceShopName }
  const [pickedWorker, setPickedWorker] = useState(null);

  // Drag over target tracking
  const [dragOverTarget, setDragOverTarget] = useState(null); // 'shopId:dateKey' or 'OFF:dateKey'

  // Data from backend
  const [shops, setShops] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currentRota, setCurrentRota] = useState(null);

  // Shop Roster: { [shopId]: [employeeId1, employeeId2, ...] }
  const [shopRosters, setShopRosters] = useState({});

  // Cells: { [`${shopId}:${employeeId}:${dateKey}`]: { status: 'AVAILABLE'|'OFF'|'LOANED'|'CUSTOM', targetShopId, targetShopName, note } }
  const [cells, setCells] = useState({});

  // Active popover state
  const [activeCell, setActiveCell] = useState(null); // { shopId, employeeId, dateKey, rect }
  const [customNoteInput, setCustomNoteInput] = useState('');

  // Add worker dropdown state per shop
  const [addingWorkerShopId, setAddingWorkerShopId] = useState(null);

  // Days in selected week (Sunday - Saturday)
  const weekDays = useMemo(() => getWeekDates(weekStart), [weekStart]);

  // Keep selectedDailyDate in sync with weekStart if week changes
  useEffect(() => {
    setSelectedDailyDate(weekStart);
  }, [weekStart]);

  // Keyboard shortcut: Escape exits pick mode or fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (pickedWorker) {
          setPickedWorker(null);
        } else if (isFullscreen) {
          setIsFullscreen(false);
        } else if (activeCell) {
          setActiveCell(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pickedWorker, isFullscreen, activeCell]);

  // Load week rota from backend
  const loadWeek = useCallback(async (targetWeek) => {
    setLoading(true);
    setError('');
    setActiveCell(null);
    setPickedWorker(null);
    try {
      const res = await axios.get(`${API}/dashboard`, { params: { weekStart: targetWeek } });
      const data = res.data || {};
      const activeShops = data.shops || [];
      const activeEmployees = data.employees || [];
      const rota = data.rota || null;

      setShops(activeShops);
      setEmployees(activeEmployees);
      setCurrentRota(rota);

      // 1. Build initial Shop Rosters
      const rosters = {};
      activeShops.forEach(shop => {
        rosters[shop._id] = [];
      });

      if (rota?.shopRoster && Array.isArray(rota.shopRoster) && rota.shopRoster.length > 0) {
        // Use saved shop roster
        rota.shopRoster.forEach(sr => {
          const sId = String(sr.shopId?._id || sr.shopId);
          if (rosters[sId]) {
            rosters[sId] = (sr.employeeIds || []).map(e => String(e._id || e));
          }
        });
      } else if (rota?.assignments && rota.assignments.length > 0) {
        // Rota exists with assignments but no shopRoster saved yet — rebuild from assignments
        rota.assignments.forEach(a => {
          const sId = String(a.shopId?._id || a.shopId);
          const eId = String(a.employeeId?._id || a.employeeId);
          if (rosters[sId] && !rosters[sId].includes(eId)) {
            rosters[sId].push(eId);
          }
        });
      }
      // else: brand new week — keep all rosters empty so admin adds workers manually

      setShopRosters(rosters);

      // 2. Build Cells map from existing assignments
      const newCells = {};
      (rota?.assignments || []).forEach(a => {
        const sId = String(a.shopId?._id || a.shopId);
        const eId = String(a.employeeId?._id || a.employeeId);
        const dKey = String(a.dateKey).slice(0, 10);
        const cellKey = `${sId}:${eId}:${dKey}`;

        newCells[cellKey] = {
          status: a.status || 'AVAILABLE',
          targetShopId: a.homeShopId && String(a.homeShopId) !== sId ? sId : null,
          targetShopName: '',
          note: a.note || '',
          startTime: a.startTime || '09:00',
          endTime: a.endTime || '17:00'
        };
      });

      setCells(newCells);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load rota.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeek(weekStart);
  }, [weekStart, loadWeek]);

  // Navigate weeks
  const changeWeek = (delta) => {
    const d = new Date(`${weekStart}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + delta * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  // Helper: get employee by ID
  const employeeMap = useMemo(() => {
    const map = new Map();
    employees.forEach(e => map.set(e._id, e));
    return map;
  }, [employees]);

  // Helper: get shop by ID
  const shopMap = useMemo(() => {
    const map = new Map();
    shops.forEach(s => map.set(s._id, s));
    return map;
  }, [shops]);

  // -------------------------------------------------------------
  // REAL-TIME CONFLICT DETECTION ENGINE
  // Detects if any worker is scheduled to work at 2+ different shops
  // on the exact same date!
  // -------------------------------------------------------------
  const conflicts = useMemo(() => {
    const scheduleTracking = {};

    shops.forEach(shop => {
      const workerIds = shopRosters[shop._id] || [];
      workerIds.forEach(empId => {
        weekDays.forEach(day => {
          const cellKey = `${shop._id}:${empId}:${day.dateKey}`;
          const cell = cells[cellKey] || { status: 'AVAILABLE' };

          let activeShopId = null;
          let activeShopName = '';

          if (cell.status === 'AVAILABLE' || cell.status === 'CUSTOM') {
            activeShopId = shop._id;
            activeShopName = shop.name;
          } else if (cell.status === 'LOANED' && cell.targetShopId) {
            activeShopId = cell.targetShopId;
            activeShopName = shopMap.get(cell.targetShopId)?.name || 'Other Shop';
          }

          if (activeShopId) {
            const trackKey = `${empId}:${day.dateKey}`;
            if (!scheduleTracking[trackKey]) {
              scheduleTracking[trackKey] = [];
            }
            scheduleTracking[trackKey].push({
              homeShopId: shop._id,
              homeShopName: shop.name,
              activeShopId,
              activeShopName,
              status: cell.status,
              note: cell.note
            });
          }
        });
      });
    });

    const foundConflicts = [];
    Object.entries(scheduleTracking).forEach(([trackKey, entries]) => {
      const distinctActiveShops = new Set(entries.map(e => e.activeShopId));
      if (distinctActiveShops.size > 1 || entries.length > 1) {
        const [empId, dateKey] = trackKey.split(':');
        const emp = employeeMap.get(empId);
        const day = weekDays.find(d => d.dateKey === dateKey);

        foundConflicts.push({
          trackKey,
          employeeId: empId,
          employeeName: emp?.name || 'Worker',
          employeeCode: emp?.employeeId || '',
          dateKey,
          dayName: day?.dayName || '',
          dateFormatted: day?.dateFormatted || dateKey,
          entries
        });
      }
    });

    return foundConflicts;
  }, [shops, shopRosters, weekDays, cells, shopMap, employeeMap]);

  // Check if a specific cell has a conflict
  const isCellConflicted = useCallback((shopId, employeeId, dateKey) => {
    return conflicts.some(c =>
      c.employeeId === employeeId &&
      c.dateKey === dateKey &&
      c.entries.some(e => e.homeShopId === shopId)
    );
  }, [conflicts]);

  // Quick conflict resolver: Keep worker at designated shop and set other shops to OFF
  const resolveConflictKeepShop = (conflict, targetShopId) => {
    const updated = { ...cells };
    conflict.entries.forEach(e => {
      const cellKey = `${e.homeShopId}:${conflict.employeeId}:${conflict.dateKey}`;
      if (e.homeShopId === targetShopId) {
        updated[cellKey] = {
          status: 'AVAILABLE',
          targetShopId: null,
          targetShopName: '',
          note: ''
        };
      } else {
        updated[cellKey] = {
          status: 'OFF',
          targetShopId: null,
          targetShopName: '',
          note: `Off (working at ${shopMap.get(targetShopId)?.name || 'other shop'})`
        };
      }
    });
    setCells(updated);
    setNotice(`Resolved: Kept ${conflict.employeeName} at ${shopMap.get(targetShopId)?.name || 'shop'} on ${conflict.dayName}.`);
  };

  // -------------------------------------------------------------
  // PICK & DROP / DRAG & DROP ENGINE (PREVENTS DOUBLE BOOKING!)
  // Moving a worker automatically clears them from other shops!
  // -------------------------------------------------------------
  const moveWorkerToTarget = (employeeId, targetShopId, dateKey) => {
    // If targetShopId is null, it means mark as OFF for this day!
    setCells(prev => {
      const next = { ...prev };

      // Set/update for every shop in roster that has this employee
      shops.forEach(s => {
        const key = `${s._id}:${employeeId}:${dateKey}`;
        if (targetShopId === null) {
          // Set to OFF
          next[key] = { status: 'OFF', targetShopId: null, targetShopName: '', note: 'OFF' };
        } else if (s._id === targetShopId) {
          // Target shop: they are Available!
          next[key] = { status: 'AVAILABLE', targetShopId: null, targetShopName: '', note: '' };
        } else if (next[key]?.status === 'AVAILABLE' || next[key]?.status === 'CUSTOM') {
          // Source or other shop: set to OFF so they are NOT in multiple shops!
          next[key] = {
            status: 'OFF',
            targetShopId: null,
            targetShopName: '',
            note: `At ${shopMap.get(targetShopId)?.name || 'other shop'}`
          };
        }
      });

      return next;
    });

    // Make sure worker is included in target shop roster
    if (targetShopId) {
      setShopRosters(prev => {
        const list = prev[targetShopId] || [];
        if (list.includes(employeeId)) return prev;
        return { ...prev, [targetShopId]: [...list, employeeId] };
      });
    }

    const empName = employeeMap.get(employeeId)?.name || 'Worker';
    const day = weekDays.find(d => d.dateKey === dateKey);
    const destName = targetShopId ? shopMap.get(targetShopId)?.name : 'Day Off (OFF)';
    setNotice(`Moved ${empName} to ${destName} on ${day?.dayName || dateKey} cleanly.`);

    setPickedWorker(null);
    setDragOverTarget(null);
  };

  // HTML5 Drag & Drop Handlers
  const handleDragStart = (e, employeeId, sourceShopId, dateKey) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ employeeId, sourceShopId, dateKey }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, targetKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTarget !== targetKey) {
      setDragOverTarget(targetKey);
    }
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const handleDrop = (e, targetShopId, dateKey) => {
    e.preventDefault();
    setDragOverTarget(null);
    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      if (data.employeeId) {
        moveWorkerToTarget(data.employeeId, targetShopId, dateKey || data.dateKey);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  // -------------------------------------------------------------
  // CELL ACTIONS (AVAILABLE, OFF, LOAN TO SHOP, CUSTOM)
  // -------------------------------------------------------------
  const openCellPopover = (shopId, employeeId, dateKey, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cellKey = `${shopId}:${employeeId}:${dateKey}`;
    const cell = cells[cellKey] || { status: 'AVAILABLE', note: '' };

    setActiveCell({
      shopId,
      employeeId,
      dateKey,
      rect,
      current: cell
    });
    setCustomNoteInput(cell.note || '');
  };

  const closeCellPopover = () => {
    setActiveCell(null);
  };

  const updateCellStatus = (status, extra = {}) => {
    if (!activeCell) return;
    const { shopId, employeeId, dateKey } = activeCell;
    const cellKey = `${shopId}:${employeeId}:${dateKey}`;

    setCells(prev => ({
      ...prev,
      [cellKey]: {
        status,
        targetShopId: extra.targetShopId || null,
        targetShopName: extra.targetShopName || '',
        note: extra.note || '',
        startTime: extra.startTime || '09:00',
        endTime: extra.endTime || '17:00'
      }
    }));

    closeCellPopover();
  };

  // Add Worker to Shop Roster
  const addWorkerToShop = (shopId, employeeId) => {
    if (!shopId || !employeeId) return;
    setShopRosters(prev => {
      const list = prev[shopId] || [];
      if (list.includes(employeeId)) return prev;
      return {
        ...prev,
        [shopId]: [...list, employeeId]
      };
    });
    setAddingWorkerShopId(null);
    setNotice(`Added worker to ${shopMap.get(shopId)?.name || 'shop'}.`);
  };

  // Remove Worker from Shop Roster
  const removeWorkerFromShop = (shopId, employeeId) => {
    const emp = employeeMap.get(employeeId);
    if (!window.confirm(`Remove ${emp?.name || 'this worker'} from this shop's weekly rota?`)) return;

    setShopRosters(prev => ({
      ...prev,
      [shopId]: (prev[shopId] || []).filter(id => id !== employeeId)
    }));

    setCells(prev => {
      const next = { ...prev };
      weekDays.forEach(day => {
        delete next[`${shopId}:${employeeId}:${day.dateKey}`];
      });
      return next;
    });

    setNotice(`Removed ${emp?.name || 'worker'} from ${shopMap.get(shopId)?.name || 'shop'}.`);
  };

  // Copy From Previous Week
  const copyFromPreviousWeek = async () => {
    const prevDate = new Date(`${weekStart}T12:00:00.000Z`);
    prevDate.setUTCDate(prevDate.getUTCDate() - 7);
    const prevWeekKey = prevDate.toISOString().slice(0, 10);

    if (!window.confirm(`Copy the weekly rota from previous week (${prevWeekKey}) into current week (${weekStart})?`)) return;

    setCopying(true);
    setError('');
    try {
      const res = await axios.get(`${API}/dashboard`, { params: { weekStart: prevWeekKey } });
      const prevRota = res.data?.rota;
      if (!prevRota || (!prevRota.assignments?.length && !prevRota.shopRoster?.length)) {
        alert('No rota records were found in the previous week to copy from.');
        return;
      }

      const newRosters = {};
      shops.forEach(s => { newRosters[s._id] = []; });

      if (prevRota.shopRoster?.length) {
        prevRota.shopRoster.forEach(sr => {
          const sId = String(sr.shopId?._id || sr.shopId);
          if (newRosters[sId]) {
            newRosters[sId] = (sr.employeeIds || []).map(e => String(e._id || e));
          }
        });
      }

      const prevDays = getWeekDates(prevWeekKey);
      const newCells = {};

      (prevRota.assignments || []).forEach(a => {
        const sId = String(a.shopId?._id || a.shopId);
        const eId = String(a.employeeId?._id || a.employeeId);
        const aDate = String(a.dateKey).slice(0, 10);
        const dayIdx = prevDays.findIndex(d => d.dateKey === aDate);

        if (dayIdx >= 0 && dayIdx < weekDays.length) {
          const targetDateKey = weekDays[dayIdx].dateKey;
          const cellKey = `${sId}:${eId}:${targetDateKey}`;
          newCells[cellKey] = {
            status: a.status || 'AVAILABLE',
            targetShopId: a.homeShopId && String(a.homeShopId) !== sId ? sId : null,
            targetShopName: '',
            note: a.note || '',
            startTime: a.startTime || '09:00',
            endTime: a.endTime || '17:00'
          };
          if (newRosters[sId] && !newRosters[sId].includes(eId)) {
            newRosters[sId].push(eId);
          }
        }
      });

      setShopRosters(newRosters);
      setCells(newCells);
      setNotice(`Successfully copied schedule from previous week (${prevWeekKey}). Review and click Save.`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to copy previous week rota.');
    } finally {
      setCopying(false);
    }
  };

  // Save Rota Draft
  const saveRota = async () => {
    if (conflicts.length > 0) {
      if (!window.confirm(
        `Warning: There are ${conflicts.length} worker conflict(s) (double-booking). Are you sure you want to save anyway? We recommend resolving them first.`
      )) return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const assignments = [];
      const shopRosterPayload = [];

      shops.forEach(shop => {
        const workerIds = shopRosters[shop._id] || [];
        shopRosterPayload.push({
          shopId: shop._id,
          employeeIds: workerIds
        });

        workerIds.forEach(empId => {
          weekDays.forEach(day => {
            const cellKey = `${shop._id}:${empId}:${day.dateKey}`;
            const cell = cells[cellKey] || { status: 'AVAILABLE' };

            if (cell.status === 'AVAILABLE' || cell.status === 'CUSTOM') {
              assignments.push({
                employeeId: empId,
                shopId: shop._id,
                dateKey: day.dateKey,
                startTime: cell.startTime || '09:00',
                endTime: cell.endTime || '17:00',
                status: cell.status,
                note: cell.note || '',
                homeShopId: shop._id
              });
            } else if (cell.status === 'LOANED' && cell.targetShopId) {
              assignments.push({
                employeeId: empId,
                shopId: cell.targetShopId,
                dateKey: day.dateKey,
                startTime: cell.startTime || '09:00',
                endTime: cell.endTime || '17:00',
                status: 'LOANED',
                note: cell.note || `Loaned from ${shop.name}`,
                homeShopId: shop._id
              });
            }
          });
        });
      });

      const payload = {
        assignments,
        shopRoster: shopRosterPayload,
        generationMethod: 'MANUAL',
        revisePublished: currentRota?.status === 'PUBLISHED'
      };

      const res = await axios.put(`${API}/week/${weekStart}/draft`, payload);
      if (res.data?.rota) {
        setCurrentRota(res.data.rota);
      }
      setNotice('Weekly Rota draft saved successfully!');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.validation?.errors?.join(', ') || err.message || 'Failed to save rota draft.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Excel: use axios so the Authorization header is included ──────────────
  const downloadExcel = async () => {
    try {
      const token = localStorage.getItem('pixx_token');
      const response = await axios.get(`${API}/week/${weekStart}/export.xlsx`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      });
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Rota_${weekStart}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert('Could not download Excel. Make sure the rota is saved first.');
      console.error(err);
    }
  };

  // ── Print: build a clean popup with only rota content ──────────────────────
  const printRota = () => {
    const printContent = document.getElementById('rota-print-area');
    if (!printContent) { window.print(); return; }
    const win = window.open('', '_blank', 'width=1200,height=800');
    win.document.write(`
      <!DOCTYPE html><html><head>
      <title>Weekly Rota – ${weekStart}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 11px; padding: 16px; color: #0f172a; }
        h2 { font-size: 16px; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: center; }
        th { background: #f1f5f9; font-weight: 700; font-size: 10px; }
        td:first-child { text-align: left; font-weight: 600; }
        .off { color: #dc2626; font-style: italic; }
        .loaned { color: #7c3aed; }
        @media print { body { padding: 8px; } }
      </style>
      </head><body>
      ${printContent.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  // Calculate active totals per shop per day
  const getShopDayTotal = (shopId, dateKey) => {
    let count = 0;
    const workerIds = shopRosters[shopId] || [];
    workerIds.forEach(empId => {
      const cellKey = `${shopId}:${empId}:${dateKey}`;
      const cell = cells[cellKey] || { status: 'AVAILABLE' };
      if (cell.status === 'AVAILABLE' || cell.status === 'CUSTOM') {
        count++;
      }
    });

    shops.forEach(otherShop => {
      if (otherShop._id === shopId) return;
      const otherWorkers = shopRosters[otherShop._id] || [];
      otherWorkers.forEach(empId => {
        const cellKey = `${otherShop._id}:${empId}:${dateKey}`;
        const cell = cells[cellKey];
        if (cell && cell.status === 'LOANED' && cell.targetShopId === shopId) {
          count++;
        }
      });
    });

    return count;
  };

  // Get active staff for a shop on a single day (for Board view)
  const getShopStaffForDay = (shopId, dateKey) => {
    const list = [];
    const workerIds = shopRosters[shopId] || [];
    workerIds.forEach(empId => {
      const cellKey = `${shopId}:${empId}:${dateKey}`;
      const cell = cells[cellKey] || { status: 'AVAILABLE' };
      if (cell.status === 'AVAILABLE' || cell.status === 'CUSTOM') {
        list.push({ employeeId: empId, homeShopId: shopId, status: cell.status, note: cell.note });
      }
    });

    // Loaned in from other shops
    shops.forEach(otherShop => {
      if (otherShop._id === shopId) return;
      const otherWorkers = shopRosters[otherShop._id] || [];
      otherWorkers.forEach(empId => {
        const cellKey = `${otherShop._id}:${empId}:${dateKey}`;
        const cell = cells[cellKey];
        if (cell && cell.status === 'LOANED' && cell.targetShopId === shopId) {
          list.push({ employeeId: empId, homeShopId: otherShop._id, status: 'LOANED', note: `From ${otherShop.name}` });
        }
      });
    });

    return list;
  };

  // Get workers who are OFF on a single day (for Board view)
  const getOffStaffForDay = (dateKey) => {
    const offList = [];
    const seen = new Set();

    shops.forEach(shop => {
      const workerIds = shopRosters[shop._id] || [];
      workerIds.forEach(empId => {
        const cellKey = `${shop._id}:${empId}:${dateKey}`;
        const cell = cells[cellKey];
        if (cell?.status === 'OFF' && !seen.has(empId)) {
          seen.add(empId);
          offList.push({ employeeId: empId, homeShopId: shop._id, note: cell.note || 'OFF' });
        }
      });
    });

    return offList;
  };

  return (
    <div className={`page-container weekly-rota-page ${isFullscreen ? 'rota-fullscreen-active' : ''}`}>
      {/* ── HEADER & ACTIONS ────────────────────────────────────────── */}
      <div className="rota-top-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="rota-main-title">Weekly Rota Planner</h1>
            <span className="rota-version-badge">Live Planner</span>
            {isFullscreen && (
              <span className="fullscreen-active-badge">⛶ Fullscreen Board</span>
            )}
          </div>
          <p className="rota-sub-title">
            Set weekly schedule for all shops in advance with Pick & Drop. Prevents double-booking automatically.
          </p>
        </div>

        <div className="rota-top-actions">
          {/* Fullscreen Toggle Button */}
          <button
            className={`btn btn-sm rota-btn-fullscreen ${isFullscreen ? 'btn-danger' : 'btn-outline'}`}
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit full screen view' : 'Open rota on full screen for easy Pick & Drop'}
          >
            {isFullscreen ? (
              <><Minimize2 size={15} /> Exit Fullscreen</>
            ) : (
              <><Maximize2 size={15} /> Fullscreen Board</>
            )}
          </button>

          {/* View Mode Switcher in Fullscreen */}
          {isFullscreen && (
            <div className="rota-view-switch">
              <button
                className={`switch-tab ${viewMode === 'GRID' ? 'active' : ''}`}
                onClick={() => setViewMode('GRID')}
              >
                Weekly Matrix
              </button>
              <button
                className={`switch-tab ${viewMode === 'BOARD' ? 'active' : ''}`}
                onClick={() => setViewMode('BOARD')}
              >
                Daily Pick & Drop Board
              </button>
            </div>
          )}

          <button
            className="btn btn-outline btn-sm rota-btn-action"
            onClick={copyFromPreviousWeek}
            disabled={copying || loading}
            title="Copy previous week's entire rota to save time"
          >
            <Copy size={15} /> {copying ? 'Copying…' : 'Copy Last Week'}
          </button>
          <button
            className="btn btn-outline btn-sm rota-btn-action"
            onClick={printRota}
            title="Print clean landscape weekly sheet"
          >
            <Printer size={15} /> Print
          </button>
          <button
            className="btn btn-outline btn-sm rota-btn-action"
            onClick={downloadExcel}
            title="Download multi-shop formatted Excel sheet"
          >
            <Download size={15} /> Excel
          </button>
          <button
            className="btn btn-primary btn-sm rota-btn-save"
            onClick={saveRota}
            disabled={saving || loading}
            title="Save changes to database"
          >
            <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* ── WEEK SELECTOR BAR ────────────────────────────────────── */}
      <div className="rota-week-navigation card">
        <button
          className="btn btn-outline btn-sm nav-arrow"
          onClick={() => changeWeek(-1)}
          aria-label="Previous week"
        >
          <ChevronLeft size={16} /> Previous Week
        </button>

        <div className="week-center-info">
          <div className="week-label-range">
            <Calendar size={18} color="#2563eb" />
            <span>
              {weekDays[0]?.fullDate} — {weekDays[6]?.fullDate}
            </span>
          </div>
          <div className="week-date-picker-wrap">
            <span style={{ fontSize: '12px', color: '#64748b' }}>Select Sunday:</span>
            <input
              type="date"
              className="rota-date-input"
              value={weekStart}
              onChange={(e) => e.target.value && setWeekStart(getSundayOf(e.target.value))}
            />
          </div>
        </div>

        <button
          className="btn btn-outline btn-sm nav-arrow"
          onClick={() => changeWeek(1)}
          aria-label="Next week"
        >
          Next Week <ChevronRight size={16} />
        </button>
      </div>

      {/* ── TOAST NOTIFICATIONS ──────────────────────────────────── */}
      {error && (
        <div className="rota-alert-msg rota-alert-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="rota-close-alert">×</button>
        </div>
      )}

      {notice && (
        <div className="rota-alert-msg rota-alert-success" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="rota-close-alert">×</button>
        </div>
      )}

      {/* ── REAL-TIME CONFLICT NOTIFICATION BANNER ───────────────── */}
      {conflicts.length > 0 ? (
        <div className="rota-conflict-banner card">
          <div className="conflict-banner-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={20} color="#dc2626" className="pulse-icon" />
              <strong style={{ fontSize: '15px', color: '#991b1b' }}>
                Double-Booking Warning: {conflicts.length} Worker Conflict{conflicts.length > 1 ? 's' : ''} Detected!
              </strong>
            </div>
            <span className="conflict-tag-count">{conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}</span>
          </div>
          <p style={{ margin: '4px 0 10px', fontSize: '13px', color: '#7f1d1d' }}>
            A worker cannot be scheduled in multiple shops on the same day. Please resolve each conflict below:
          </p>
          <div className="conflict-list">
            {conflicts.map((c, idx) => (
              <div key={idx} className="conflict-item-card">
                <div className="conflict-item-info">
                  <span className="conflict-worker-badge">{c.employeeName} ({c.employeeCode})</span>
                  <span className="conflict-date-badge">📅 {c.dayName}, {c.dateFormatted}</span>
                  <span className="conflict-shops-text">
                    Assigned at: <strong>{c.entries.map(e => e.activeShopName).join(' & ')}</strong>
                  </span>
                </div>
                <div className="conflict-fix-actions">
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Quick Fix:</span>
                  {c.entries.map((e, eIdx) => (
                    <button
                      key={eIdx}
                      className="btn btn-sm conflict-fix-btn"
                      onClick={() => resolveConflictKeepShop(c, e.homeShopId)}
                      title={`Keep ${c.employeeName} at ${e.homeShopName} and set other shops to OFF`}
                    >
                      Keep at {e.homeShopName}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rota-no-conflict-bar">
          <Check size={16} color="#16a34a" />
          <span>Conflict-Free Rota: No workers are scheduled on multiple shops on any day.</span>
        </div>
      )}

      {/* ── PICK & DROP FLOATING ACTION BAR ─────────────────────── */}
      {pickedWorker && (
        <div className="pick-drop-float-bar">
          <div className="pick-info">
            <span className="pick-icon">📌</span>
            <div>
              <strong>Picked: {pickedWorker.employeeName}</strong>
              <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
                Day: {weekDays.find(d => d.dateKey === pickedWorker.dateKey)?.dayName || pickedWorker.dateKey} • From: {pickedWorker.sourceShopName}
              </div>
            </div>
          </div>

          <div className="pick-dest-buttons">
            <span style={{ fontSize: '11px', color: '#cbd5e1', alignSelf: 'center' }}>Click to Move:</span>
            {shops.map(s => (
              <button
                key={s._id}
                className="btn btn-sm btn-pick-dest"
                onClick={() => moveWorkerToTarget(pickedWorker.employeeId, s._id, pickedWorker.dateKey)}
              >
                {s.name}
              </button>
            ))}
            <button
              className="btn btn-sm btn-pick-off"
              onClick={() => moveWorkerToTarget(pickedWorker.employeeId, null, pickedWorker.dateKey)}
            >
              🔴 Set to OFF
            </button>
            <button
              className="btn btn-sm btn-pick-cancel"
              onClick={() => setPickedWorker(null)}
            >
              ✕ Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── DAILY DISPATCH BOARD (KANBAN PICK & DROP MODE) ───────── */}
      {isFullscreen && viewMode === 'BOARD' ? (
        <div className="rota-daily-board-container card">
          {/* Day Tabs */}
          <div className="daily-board-day-tabs">
            {weekDays.map(d => (
              <button
                key={d.dateKey}
                className={`daily-tab-btn ${selectedDailyDate === d.dateKey ? 'active' : ''}`}
                onClick={() => setSelectedDailyDate(d.dateKey)}
              >
                <span className="tab-day">{d.dayName}</span>
                <span className="tab-date">{d.dateFormatted}</span>
              </button>
            ))}
          </div>

          {/* Columns Grid */}
          <div className="daily-board-columns-grid">
            {shops.map(shop => {
              const style = getShopStyle(shop.name);
              const staffList = getShopStaffForDay(shop._id, selectedDailyDate);
              const isTargetHovered = dragOverTarget === `${shop._id}:${selectedDailyDate}`;

              return (
                <div
                  key={shop._id}
                  className={`daily-shop-column ${isTargetHovered ? 'drag-over-active' : ''}`}
                  style={{ borderColor: style.border }}
                  onDragOver={(e) => handleDragOver(e, `${shop._id}:${selectedDailyDate}`)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, shop._id, selectedDailyDate)}
                >
                  {/* Column Header */}
                  <div className="column-header" style={{ background: style.pillBg, borderBottom: `2px solid ${style.color}` }}>
                    <div>
                      <strong style={{ color: style.text, fontSize: '14px' }}>{shop.name}</strong>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{staffList.length} staff working</div>
                    </div>
                    {/* Quick drop button if picked */}
                    {pickedWorker && pickedWorker.dateKey === selectedDailyDate && (
                      <button
                        className="btn btn-sm btn-primary drop-here-btn"
                        onClick={() => moveWorkerToTarget(pickedWorker.employeeId, shop._id, selectedDailyDate)}
                      >
                        Drop Here
                      </button>
                    )}
                  </div>

                  {/* Worker Cards */}
                  <div className="column-cards-list">
                    {staffList.length === 0 ? (
                      <div className="empty-column-dropzone">
                        <span>Drag or Drop worker here</span>
                      </div>
                    ) : (
                      staffList.map(item => {
                        const emp = employeeMap.get(item.employeeId);
                        const isPicked = pickedWorker?.employeeId === item.employeeId && pickedWorker?.dateKey === selectedDailyDate;

                        return (
                          <div
                            key={item.employeeId}
                            className={`worker-drag-card ${isPicked ? 'picked-card-highlight' : ''}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, item.employeeId, item.homeShopId, selectedDailyDate)}
                          >
                            <div className="card-top-row">
                              <span className="card-grip"><GripVertical size={14} color="#94a3b8" /></span>
                              <strong className="card-name">{emp?.name || 'Worker'}</strong>
                              <span className="card-id">{emp?.employeeId || ''}</span>
                            </div>

                            {item.note && (
                              <div className="card-note-badge">{item.note}</div>
                            )}

                            <div className="card-action-bar">
                              <button
                                className="card-pick-btn"
                                onClick={() => setPickedWorker({
                                  employeeId: item.employeeId,
                                  sourceShopId: item.homeShopId,
                                  dateKey: selectedDailyDate,
                                  employeeName: emp?.name || 'Worker',
                                  sourceShopName: shop.name
                                })}
                                title="Pick to move this worker to another shop"
                              >
                                <Move size={12} /> {isPicked ? 'Picked' : 'Move'}
                              </button>
                              <button
                                className="card-off-btn"
                                onClick={() => moveWorkerToTarget(item.employeeId, null, selectedDailyDate)}
                                title="Mark as OFF for this day"
                              >
                                Set OFF
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}

            {/* OFF / ABSENT COLUMN */}
            <div
              className={`daily-shop-column column-off-pool ${dragOverTarget === `OFF:${selectedDailyDate}` ? 'drag-over-active' : ''}`}
              onDragOver={(e) => handleDragOver(e, `OFF:${selectedDailyDate}`)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, null, selectedDailyDate)}
            >
              <div className="column-header header-off">
                <div>
                  <strong style={{ color: '#991b1b', fontSize: '14px' }}>🔴 OFF / Absent</strong>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {getOffStaffForDay(selectedDailyDate).length} staff off
                  </div>
                </div>
                {pickedWorker && pickedWorker.dateKey === selectedDailyDate && (
                  <button
                    className="btn btn-sm btn-danger drop-here-btn"
                    onClick={() => moveWorkerToTarget(pickedWorker.employeeId, null, selectedDailyDate)}
                  >
                    Drop to OFF
                  </button>
                )}
              </div>

              <div className="column-cards-list">
                {getOffStaffForDay(selectedDailyDate).length === 0 ? (
                  <div className="empty-column-dropzone">
                    <span>No staff off today</span>
                  </div>
                ) : (
                  getOffStaffForDay(selectedDailyDate).map(item => {
                    const emp = employeeMap.get(item.employeeId);
                    const isPicked = pickedWorker?.employeeId === item.employeeId && pickedWorker?.dateKey === selectedDailyDate;

                    return (
                      <div
                        key={item.employeeId}
                        className={`worker-drag-card card-off-item ${isPicked ? 'picked-card-highlight' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.employeeId, item.homeShopId, selectedDailyDate)}
                      >
                        <div className="card-top-row">
                          <span className="card-grip"><GripVertical size={14} color="#94a3b8" /></span>
                          <strong className="card-name" style={{ color: '#991b1b' }}>{emp?.name || 'Worker'}</strong>
                          <span className="card-id">{emp?.employeeId || ''}</span>
                        </div>
                        <div className="card-action-bar">
                          <button
                            className="card-pick-btn"
                            onClick={() => setPickedWorker({
                              employeeId: item.employeeId,
                              sourceShopId: item.homeShopId,
                              dateKey: selectedDailyDate,
                              employeeName: emp?.name || 'Worker',
                              sourceShopName: 'OFF'
                            })}
                          >
                            <Move size={12} /> Assign to Shop
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── WEEKLY MATRIX VIEW (GRID) ────────────────────────────── */
        loading ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="spin-icon" style={{ marginBottom: '10px' }} />
            <div>Loading weekly rota schedule…</div>
          </div>
        ) : (
          <div id="rota-print-area" className="rota-shops-container">
            {shops.map(shop => {
              const style = getShopStyle(shop.name);
              const workerIds = shopRosters[shop._id] || [];
              const isAddingWorker = addingWorkerShopId === shop._id;
              const availableToAdd = employees.filter(e => !workerIds.includes(e._id));

              return (
                <div key={shop._id} className="shop-rota-card card">
                  {/* Shop Card Header */}
                  <div
                    className="shop-card-header"
                    style={{ borderLeft: `6px solid ${style.color}` }}
                  >
                    <div className="shop-title-wrap">
                      <span
                        className="shop-pill-badge"
                        style={{ background: style.pillBg, color: style.text, borderColor: style.border }}
                      >
                        {shop.name}
                      </span>
                      <span className="shop-staff-count">
                        {workerIds.length} worker{workerIds.length === 1 ? '' : 's'} assigned
                      </span>
                    </div>

                    <div className="shop-header-actions">
                      <div style={{ position: 'relative' }}>
                        <button
                          className="btn btn-outline btn-sm add-worker-btn"
                          onClick={() => setAddingWorkerShopId(isAddingWorker ? null : shop._id)}
                        >
                          <Plus size={14} /> Add Worker
                        </button>

                        {isAddingWorker && (
                          <div className="add-worker-popover card">
                            <div className="add-worker-header">
                              <span>Add Worker to {shop.name}</span>
                              <button onClick={() => setAddingWorkerShopId(null)}><X size={14} /></button>
                            </div>
                            <div className="add-worker-list">
                              {availableToAdd.length === 0 ? (
                                <div style={{ padding: '12px', fontSize: '12px', color: '#94a3b8' }}>
                                  All active workers are already in this shop's roster.
                                </div>
                              ) : (
                                availableToAdd.map(emp => (
                                  <button
                                    key={emp._id}
                                    className="add-worker-item"
                                    onClick={() => addWorkerToShop(shop._id, emp._id)}
                                  >
                                    <strong>{emp.name}</strong>
                                    <span>{emp.employeeId}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Shop Matrix Table */}
                  <div className="table-responsive">
                    <table className="custom-table rota-matrix-table">
                      <thead>
                        <tr>
                          <th className="th-worker-name">Name</th>
                          {weekDays.map(day => (
                            <th
                              key={day.dateKey}
                              className={`th-day-col ${dragOverTarget === `${shop._id}:${day.dateKey}` ? 'th-drag-hover' : ''}`}
                              onDragOver={(e) => handleDragOver(e, `${shop._id}:${day.dateKey}`)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, shop._id, day.dateKey)}
                            >
                              <div className="day-col-header">
                                <span className="day-name">{day.dayName}</span>
                                <span className="day-date">{day.dateFormatted}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {workerIds.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="empty-roster-msg">
                              No workers assigned to this shop yet. Click <strong>+ Add Worker</strong> above to start.
                            </td>
                          </tr>
                        ) : (
                          workerIds.map(empId => {
                            const emp = employeeMap.get(empId);
                            const empName = emp?.name || 'Unknown Worker';
                            const empCode = emp?.employeeId || '';

                            return (
                              <tr key={empId}>
                                <td className="td-worker-cell">
                                  <div className="worker-info-wrap">
                                    <div>
                                      <div className="worker-name-label">{empName}</div>
                                      <div className="worker-id-sub">{empCode}</div>
                                    </div>
                                    <button
                                      className="remove-worker-btn"
                                      onClick={() => removeWorkerFromShop(shop._id, empId)}
                                      title="Remove from this shop's roster"
                                      aria-label="Remove worker"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>

                                {weekDays.map(day => {
                                  const cellKey = `${shop._id}:${empId}:${day.dateKey}`;
                                  const cell = cells[cellKey] || { status: 'AVAILABLE' };
                                  const conflicted = isCellConflicted(shop._id, empId, day.dateKey);
                                  const isPicked = pickedWorker?.employeeId === empId && pickedWorker?.dateKey === day.dateKey;

                                  let cellClass = 'rota-cell-btn';
                                  let cellLabel = 'Available';
                                  let cellStyle = {};

                                  if (conflicted) {
                                    cellClass += ' cell-conflicted';
                                  } else if (cell.status === 'OFF') {
                                    cellClass += ' cell-off';
                                    cellLabel = 'OFF';
                                  } else if (cell.status === 'LOANED' && cell.targetShopId) {
                                    const targetShop = shopMap.get(cell.targetShopId);
                                    const targetStyle = getShopStyle(targetShop?.name || '');
                                    cellClass += ' cell-loaned';
                                    cellLabel = targetShop?.name || 'Other Shop';
                                    cellStyle = {
                                      backgroundColor: targetStyle.pillBg,
                                      color: targetStyle.text,
                                      borderColor: targetStyle.border
                                    };
                                  } else if (cell.status === 'CUSTOM' && cell.note) {
                                    cellClass += ' cell-custom';
                                    cellLabel = cell.note;
                                  } else {
                                    cellClass += ' cell-available';
                                    cellLabel = 'Available';
                                  }

                                  if (isPicked) {
                                    cellClass += ' cell-picked-ring';
                                  }

                                  return (
                                    <td
                                      key={day.dateKey}
                                      className="td-cell-slot"
                                      onDragOver={(e) => handleDragOver(e, `${shop._id}:${day.dateKey}`)}
                                      onDragLeave={handleDragLeave}
                                      onDrop={(e) => handleDrop(e, shop._id, day.dateKey)}
                                    >
                                      <div className="cell-drag-wrap">
                                        <button
                                          type="button"
                                          className={cellClass}
                                          style={cellStyle}
                                          draggable
                                          onDragStart={(e) => handleDragStart(e, empId, shop._id, day.dateKey)}
                                          onClick={(e) => openCellPopover(shop._id, empId, day.dateKey, e)}
                                          title="Click to edit, or drag & drop to another shop"
                                        >
                                          {conflicted && <span className="conflict-dot">⚠️</span>}
                                          <span>{cellLabel}</span>
                                        </button>

                                        {/* Quick Pick Button on Hover */}
                                        <button
                                          type="button"
                                          className="quick-pick-btn"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPickedWorker({
                                              employeeId: empId,
                                              sourceShopId: shop._id,
                                              dateKey: day.dateKey,
                                              employeeName: empName,
                                              sourceShopName: shop.name
                                            });
                                          }}
                                          title="Pick worker to move to another shop"
                                        >
                                          <Move size={11} />
                                        </button>
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })
                        )}

                        {/* Total Staff Row */}
                        <tr className="tr-total-row">
                          <td className="td-total-label">Total</td>
                          {weekDays.map(day => {
                            const total = getShopDayTotal(shop._id, day.dateKey);
                            return (
                              <td key={day.dateKey} className="td-total-count">
                                <strong>{total}</strong>
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── INTERACTIVE CELL POPOVER / MODAL ─────────────────────── */}
      {activeCell && (
        <div className="rota-modal-backdrop" onClick={closeCellPopover}>
          <div className="rota-popover-card card" onClick={(e) => e.stopPropagation()}>
            <div className="popover-header">
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', color: '#0f172a' }}>
                  {employeeMap.get(activeCell.employeeId)?.name || 'Worker'}
                </h4>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {weekDays.find(d => d.dateKey === activeCell.dateKey)?.dayName} •{' '}
                  {weekDays.find(d => d.dateKey === activeCell.dateKey)?.dateFormatted}
                </div>
              </div>
              <button className="popover-close-btn" onClick={closeCellPopover}>
                <X size={16} />
              </button>
            </div>

            <div className="popover-body">
              {/* Primary Quick Status */}
              <div className="popover-section-title">Quick Status:</div>
              <div className="popover-quick-grid">
                <button
                  className="quick-btn-opt opt-available"
                  onClick={() => updateCellStatus('AVAILABLE')}
                >
                  <span className="dot dot-green"></span>
                  <strong>Available</strong> (Working at {shopMap.get(activeCell.shopId)?.name})
                </button>
                <button
                  className="quick-btn-opt opt-off"
                  onClick={() => updateCellStatus('OFF')}
                >
                  <span className="dot dot-red"></span>
                  <strong>OFF</strong> (Day Off / Absent)
                </button>
              </div>

              {/* Move / Pick worker button */}
              <div style={{ marginTop: '12px' }}>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => {
                    const emp = employeeMap.get(activeCell.employeeId);
                    setPickedWorker({
                      employeeId: activeCell.employeeId,
                      sourceShopId: activeCell.shopId,
                      dateKey: activeCell.dateKey,
                      employeeName: emp?.name || 'Worker',
                      sourceShopName: shopMap.get(activeCell.shopId)?.name || 'Shop'
                    });
                    closeCellPopover();
                  }}
                >
                  <Move size={14} /> 📌 Pick & Move to Another Shop
                </button>
              </div>

              {/* Transfer / Send to Another Shop */}
              <div className="popover-section-title" style={{ marginTop: '14px' }}>
                Transfer / Send to Another Shop:
              </div>
              <div className="popover-shops-grid">
                {shops
                  .filter(s => s._id !== activeCell.shopId)
                  .map(otherShop => {
                    const oStyle = getShopStyle(otherShop.name);
                    return (
                      <button
                        key={otherShop._id}
                        className="opt-shop-btn"
                        style={{
                          background: oStyle.bg,
                          color: oStyle.text,
                          borderColor: oStyle.border
                        }}
                        onClick={() => updateCellStatus('LOANED', {
                          targetShopId: otherShop._id,
                          targetShopName: otherShop.name,
                          note: `At ${otherShop.name}`
                        })}
                      >
                        {otherShop.name}
                      </button>
                    );
                  })}
              </div>

              {/* Quick Shift Presets & Custom Note */}
              <div className="popover-section-title" style={{ marginTop: '14px' }}>
                Shift Hours / Note:
              </div>
              <div className="popover-presets-row">
                <button
                  className="preset-pill-btn"
                  onClick={() => updateCellStatus('CUSTOM', { note: '09:00 - 17:00' })}
                >
                  09:00 – 17:00
                </button>
                <button
                  className="preset-pill-btn"
                  onClick={() => updateCellStatus('CUSTOM', { note: '10:00 - 19:00' })}
                >
                  10:00 – 19:00
                </button>
                <button
                  className="preset-pill-btn"
                  onClick={() => updateCellStatus('CUSTOM', { note: 'Half Day' })}
                >
                  Half Day
                </button>
                <button
                  className="preset-pill-btn"
                  onClick={() => updateCellStatus('CUSTOM', { note: 'Available (02:00 pm to 07:00 pm)' })}
                >
                  02:00 pm – 07:00 pm
                </button>
              </div>

              <div className="popover-custom-input-wrap">
                <input
                  type="text"
                  className="custom-note-field"
                  placeholder="Or enter custom note (e.g. Available (04:00 pm))"
                  value={customNoteInput}
                  onChange={(e) => setCustomNoteInput(e.target.value)}
                />
                <button
                  className="btn btn-outline btn-sm apply-note-btn"
                  onClick={() => {
                    if (customNoteInput.trim()) {
                      updateCellStatus('CUSTOM', { note: customNoteInput.trim() });
                    }
                  }}
                  disabled={!customNoteInput.trim()}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
