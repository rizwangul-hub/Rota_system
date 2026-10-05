import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle, AlertTriangle, ArrowRight, Calendar, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Copy, Download, Eye, EyeOff, GripVertical,
  Maximize2, Minimize2, Move, Plus, Printer, RefreshCw, Save, Trash2,
  UserCheck, UserX, Users, X
} from 'lucide-react';
import { API_BASE_URL } from '../context/AuthContext';
import './WeeklyRotaPlanner.css';

const API = `${API_BASE_URL}/rota`;

// Shop Colors & Brand Styling
const SHOP_COLORS = {
  Station:   { name: 'Station Cycles',   color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', pillBg: '#cce5ff', text: '#002060', excelBg: '#cce5ff' },
  Camden:    { name: 'Camden Cycles',    color: '#d97706', bg: '#fffbeb', border: '#fde68a', pillBg: '#fff3cd', text: '#664d03', excelBg: '#fff3cd' },
  Chelsea:   { name: 'Chelsea Bikes',    color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4', pillBg: '#d1ecf1', text: '#055160', excelBg: '#d1ecf1' },
  Edgware:   { name: 'Edgware Cycles',   color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', pillBg: '#a5f3fc', text: '#004d40', excelBg: '#a5f3fc' },
  Southwark: { name: 'Southwark Cycles', color: '#ca8a04', bg: '#fefce8', border: '#fef08a', pillBg: '#fef08a', text: '#554400', excelBg: '#fef08a' },
  Leebridge: { name: 'Leebridge Cycles', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', pillBg: '#d4edda', text: '#0f5132', excelBg: '#d4edda' },
  Leabridge: { name: 'Leebridge Cycles', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', pillBg: '#d4edda', text: '#0f5132', excelBg: '#d4edda' }
};

function getShopStyle(shopName = '') {
  for (const [key, val] of Object.entries(SHOP_COLORS)) {
    if (shopName.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return { name: shopName, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', pillBg: '#dbeafe', text: '#1d4ed8', excelBg: '#e2e8f0' };
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
  const [viewMode, setViewMode] = useState('SHEET'); // 'SHEET' (Unified Excel Rota), 'GRID' (Cards matrix), or 'BOARD' (Daily board)
  const [selectedDailyDate, setSelectedDailyDate] = useState(() => weekStart);

  // Pick & Drop active state: { employeeId, sourceShopId, dateKey, employeeName, sourceShopName }
  const [pickedWorker, setPickedWorker] = useState(null);

  // Drag over target tracking
  const [dragOverTarget, setDragOverTarget] = useState(null); // 'shopId:dateKey' or 'OFF:dateKey'

  // Data from backend
  const [shops, setShops] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currentRota, setCurrentRota] = useState(null);
  const [availabilities, setAvailabilities] = useState([]);

  // Shop Roster: { [shopId]: [employeeId1, employeeId2, ...] }
  const [shopRosters, setShopRosters] = useState({});

  // Cells: { [`${shopId}:${employeeId}:${dateKey}`]: { status: 'AVAILABLE'|'OFF'|'LOANED'|'CUSTOM', targetShopId, targetShopName, note } }
  const [cells, setCells] = useState({});

  // Active popover state
  const [activeCell, setActiveCell] = useState(null); // { shopId, employeeId, dateKey, rect }
  const [customNoteInput, setCustomNoteInput] = useState('');

  // Add worker dropdown state per shop
  const [addingWorkerShopId, setAddingWorkerShopId] = useState(null);
  const [workerSearch, setWorkerSearch] = useState('');

  // ── PREVIEW PREVIOUS ROTA STATE ────────────────────────────────────────
  // prevRota: last week's rota data: { assignments[], shopRoster[] }
  const [prevRota, setPrevRota] = useState(null);
  const [prevRotaLoading, setPrevRotaLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false); // toggle overlay

  // Available Workers Modal: when clicking OFF/unavailable slot in preview
  // { shopId, shopName, employeeId, employeeName, employeeCode, dateKey, dayName, availableWorkers[], transferrableWorkers[] }
  const [availModal, setAvailModal] = useState(null);

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
        } else if (availModal) {
          setAvailModal(null);
        } else if (isFullscreen) {
          setIsFullscreen(false);
        } else if (activeCell) {
          setActiveCell(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pickedWorker, isFullscreen, activeCell, availModal]);

  // Load week rota from backend
  const loadWeek = useCallback(async (targetWeek) => {
    setLoading(true);
    setError('');
    setActiveCell(null);
    setPickedWorker(null);
    try {
      const [res, availRes] = await Promise.all([
        axios.get(`${API}/dashboard`, { params: { weekStart: targetWeek } }),
        axios.get(`${API}/availability`, { params: { weekStart: targetWeek } }).catch(() => ({ data: { availability: [] } }))
      ]);

      const data = res.data || {};
      const activeShops = data.shops || [];
      const activeEmployees = data.employees || [];
      const rota = data.rota || null;

      setShops(activeShops);
      setEmployees(activeEmployees);
      setCurrentRota(rota);
      setAvailabilities(availRes?.data?.availability || []);

      // 1. Build initial Shop Rosters
      const rosters = {};
      activeShops.forEach(shop => {
        rosters[shop._id] = [];
      });

      if (rota?.shopRoster && Array.isArray(rota.shopRoster) && rota.shopRoster.length > 0) {
        // Use saved shop roster (source of truth when available)
        rota.shopRoster.forEach(sr => {
          const sId = String(sr.shopId?._id || sr.shopId);
          if (rosters[sId]) {
            rosters[sId] = [...new Set((sr.employeeIds || []).map(e => String(e._id || e)))];
          }
        });
      } else if (rota?.assignments && rota.assignments.length > 0) {
        // Rota exists with assignments but no shopRoster saved yet — rebuild from assignments.
        // IMPORTANT: use homeShopId (the worker's home shop) not shopId (which is the target
        // shop for LOANED workers). This ensures loaned workers appear under their home shop row.
        rota.assignments.forEach(a => {
          const homeId = String(a.homeShopId?._id || a.homeShopId || a.shopId?._id || a.shopId);
          const eId = String(a.employeeId?._id || a.employeeId);
          if (rosters[homeId] && !rosters[homeId].includes(eId)) {
            rosters[homeId].push(eId);
          }
        });
      }

      setShopRosters(rosters);

      // 2. Build cells from saved assignments; displayed shop names are resolved from live cells.
      const newCells = {};
      (rota?.assignments || []).forEach(a => {
        const rawShopId = String(a.shopId?._id || a.shopId);
        const rawHomeId = String(a.homeShopId?._id || a.homeShopId || rawShopId);
        const eId = String(a.employeeId?._id || a.employeeId);
        const dKey = String(a.dateKey).slice(0, 10);
        const isLoaned = a.status === 'LOANED' || rawHomeId !== rawShopId;
        const cellKey = `${rawHomeId}:${eId}:${dKey}`;
        newCells[cellKey] = {
          status: a.status || 'AVAILABLE',
          targetShopId: isLoaned ? rawShopId : null,
          targetShopName: a.targetShopName || '',
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
    setPrevRota(null);
    setShowPreview(false);
  }, [weekStart, loadWeek]);

  // Helper: compute previous week's Sunday
  const prevWeekStart = useMemo(() => {
    const d = new Date(`${weekStart}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  }, [weekStart]);

  // Load previous week's rota for preview
  const loadPrevWeekRota = useCallback(async () => {
    setPrevRotaLoading(true);
    try {
      const res = await axios.get(`${API}/dashboard`, { params: { weekStart: prevWeekStart } });
      const data = res.data || {};
      const rota = data.rota || null;
      setPrevRota(rota);
      setShowPreview(true);
      setNotice(`Previewing previous week's rota (${prevWeekStart}). Unavailable/OFF workers are highlighted in RED.`);
    } catch (err) {
      setError('Could not load previous week rota for preview.');
      setPrevRota(null);
    } finally {
      setPrevRotaLoading(false);
    }
  }, [prevWeekStart]);

  // Toggle preview mode
  const togglePreview = () => {
    if (showPreview) {
      setShowPreview(false);
    } else {
      if (prevRota) {
        setShowPreview(true);
      } else {
        loadPrevWeekRota();
      }
    }
  };

  // Check if a worker is considered unavailable or absent in current week
  const checkIsWorkerUnavailableInPreview = useCallback((shopId, employeeId, dateKey, dayIndex) => {
    const cellKey = `${shopId}:${employeeId}:${dateKey}`;
    const cell = cells[cellKey];

    // Explicitly marked OFF
    if (cell?.status === 'OFF') return true;

    // Explicitly marked UNAVAILABLE in availability records
    const isUnavail = availabilities.some(
      a => String(a.employeeId?._id || a.employeeId) === String(employeeId) &&
           a.dateKey === dateKey &&
           a.status === 'UNAVAILABLE'
    );
    if (isUnavail) return true;

    // If prevRota is loaded: was this worker scheduled in previous week at this shop on this day,
    // but in current week they are absent / not scheduled / not available?
    if (prevRota) {
      const prevDays = getWeekDates(prevWeekStart);
      const prevDateKey = prevDays[dayIndex]?.dateKey;
      if (prevDateKey) {
        const prevAssignment = (prevRota.assignments || []).find(
          a => String(a.employeeId?._id || a.employeeId) === String(employeeId) &&
               String(a.homeShopId || a.shopId) === String(shopId) &&
               a.dateKey === prevDateKey &&
               a.status !== 'OFF'
        );
        if (prevAssignment) {
          if (!cell || cell.status === 'OFF') return true;
        }
      }
    }

    return false;
  }, [cells, availabilities, prevRota, prevWeekStart]);

  // Open the replacement / availability modal
  const openAvailabilityModal = (shopId, employeeId, dateKey, dayName) => {
    const shop = shopMap.get(shopId);
    const emp = employeeMap.get(employeeId);

    // 1. Available workers: Active employees not working in ANY shop on this day
    const busyEmpIds = new Set();
    shops.forEach(s => {
      const workerIds = shopRosters[s._id] || [];
      workerIds.forEach(eId => {
        const c = cells[`${s._id}:${eId}:${dateKey}`];
        if (c && (c.status === 'AVAILABLE' || c.status === 'CUSTOM' || c.status === 'LOANED')) {
          busyEmpIds.add(eId);
        }
      });
    });

    const availableWorkers = employees.filter(e =>
      e.employmentStatus === 'Active' && !busyEmpIds.has(e._id) && e._id !== employeeId
    );

    // 2. Transfer / Borrow workers: Active employees currently working in OTHER shops on this day
    const transferrableWorkers = [];
    shops.forEach(s => {
      if (s._id === shopId) return;
      const workerIds = shopRosters[s._id] || [];
      workerIds.forEach(eId => {
        const c = cells[`${s._id}:${eId}:${dateKey}`];
        if (c && (c.status === 'AVAILABLE' || c.status === 'CUSTOM')) {
          const workerEmp = employeeMap.get(eId);
          if (workerEmp?.employmentStatus === 'Active') {
            transferrableWorkers.push({
              employeeId: eId,
              employeeName: workerEmp.name,
              employeeCode: workerEmp.employeeId || '',
              currentShopId: s._id,
              currentShopName: s.name,
              currentStatus: c.status,
              note: c.note || ''
            });
          }
        }
      });
    });

    setAvailModal({
      shopId,
      shopName: shop?.name || 'Shop',
      employeeId,
      employeeName: emp?.name || 'Worker',
      employeeCode: emp?.employeeId || '',
      dateKey,
      dayName,
      availableWorkers,
      transferrableWorkers
    });
  };

  const assignAvailableWorker = (newEmpId) => {
    if (!availModal) return;
    const { shopId, dateKey, dayName, shopName } = availModal;
    const newEmp = employeeMap.get(newEmpId);

    setShopRosters(prev => {
      const list = prev[shopId] || [];
      if (list.includes(newEmpId)) return prev;
      return { ...prev, [shopId]: [...list, newEmpId] };
    });

    setCells(prev => ({
      ...prev,
      [`${shopId}:${newEmpId}:${dateKey}`]: {
        status: 'AVAILABLE',
        targetShopId: null,
        targetShopName: '',
        note: ''
      }
    }));

    setNotice(`Assigned ${newEmp?.name || 'worker'} to ${shopName} on ${dayName}.`);
    setAvailModal(null);
  };

  const transferWorkerFromShop = (sourceEmpId, sourceShopId) => {
    if (!availModal) return;
    const { shopId: destShopId, shopName: destShopName, dateKey, dayName } = availModal;
    const workerEmp = employeeMap.get(sourceEmpId);
    const sourceShop = shopMap.get(sourceShopId);

    setCells(prev => {
      const next = { ...prev };
      next[`${sourceShopId}:${sourceEmpId}:${dateKey}`] = {
        status: 'LOANED',
        targetShopId: destShopId,
        targetShopName: destShopName,
        note: `Transferred to ${destShopName}`
      };
      next[`${destShopId}:${sourceEmpId}:${dateKey}`] = {
        status: 'AVAILABLE',
        targetShopId: null,
        targetShopName: '',
        note: `Transferred from ${sourceShop?.name || 'other shop'}`
      };
      return next;
    });

    setShopRosters(prev => {
      const list = prev[destShopId] || [];
      if (list.includes(sourceEmpId)) return prev;
      return { ...prev, [destShopId]: [...list, sourceEmpId] };
    });

    setNotice(`Transferred ${workerEmp?.name || 'worker'} from ${sourceShop?.name} to ${destShopName} on ${dayName}.`);
    setAvailModal(null);
  };

  const forceOriginalAvailable = () => {
    if (!availModal) return;
    const { shopId, employeeId, dateKey, employeeName, shopName, dayName } = availModal;
    setCells(prev => ({
      ...prev,
      [`${shopId}:${employeeId}:${dateKey}`]: {
        status: 'AVAILABLE',
        targetShopId: null,
        targetShopName: '',
        note: ''
      }
    }));
    setNotice(`Marked ${employeeName} as Available at ${shopName} on ${dayName}.`);
    setAvailModal(null);
  };

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

  const getWorkerDayDisplay = (shopId, employeeId, dateKey) => {
    const ownCell = cells[`${shopId}:${employeeId}:${dateKey}`];
    if (ownCell?.status === 'AVAILABLE') return { text: 'Available', status: 'AVAILABLE' };
    if (ownCell?.status === 'CUSTOM') return { text: ownCell.note || 'Available', status: 'CUSTOM' };
    if (ownCell?.status === 'LOANED' && ownCell.targetShopId) {
      return {
        text: shopMap.get(ownCell.targetShopId)?.name || ownCell.targetShopName || ownCell.note || 'Other Shop',
        status: 'LOANED'
      };
    }

    for (const otherShop of shops) {
      if (otherShop._id === shopId) continue;
      const otherCell = cells[`${otherShop._id}:${employeeId}:${dateKey}`];
      if (!otherCell || otherCell.status === 'OFF') continue;
      const targetShopName = otherCell.status === 'LOANED' && otherCell.targetShopId
        ? shopMap.get(otherCell.targetShopId)?.name || otherCell.targetShopName || otherShop.name
        : otherShop.name;
      return { text: targetShopName, status: 'LOANED' };
    }

    if (ownCell?.status === 'OFF') return { text: 'OFF', status: 'OFF' };
    const isOffElsewhere = shops.some(otherShop =>
      otherShop._id !== shopId &&
      cells[`${otherShop._id}:${employeeId}:${dateKey}`]?.status === 'OFF'
    );
    return isOffElsewhere
      ? { text: 'OFF', status: 'OFF' }
      : { text: 'Available', status: 'AVAILABLE' };
  };

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
      if (distinctActiveShops.size > 1) {
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
    const employee = employeeMap.get(employeeId);
    if (employee?.employmentStatus !== 'Active') {
      setError(`${employee?.name || 'This worker'} cannot be added because their employment status is ${employee?.employmentStatus || 'inactive'}. Reactivate them in Staff / Employees first.`);
      return;
    }
    setShopRosters(prev => {
      const list = prev[shopId] || [];
      if (list.includes(employeeId)) return prev;
      return {
        ...prev,
        [shopId]: [...list, employeeId]
      };
    });
    setAddingWorkerShopId(null);
    setWorkerSearch('');
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
        const rawShopId = String(a.shopId?._id || a.shopId);
        const rawHomeId = String(a.homeShopId?._id || a.homeShopId || rawShopId);
        const eId = String(a.employeeId?._id || a.employeeId);
        const aDate = String(a.dateKey).slice(0, 10);
        const dayIdx = prevDays.findIndex(d => d.dateKey === aDate);

        if (dayIdx >= 0 && dayIdx < weekDays.length) {
          const targetDateKey = weekDays[dayIdx].dateKey;
          const isLoaned = a.status === 'LOANED' || rawHomeId !== rawShopId;
          // Key by homeShopId so cell appears under the correct home shop row
          const cellKey = `${rawHomeId}:${eId}:${targetDateKey}`;
          newCells[cellKey] = {
            status: a.status || 'AVAILABLE',
            targetShopId: isLoaned ? rawShopId : null,
            targetShopName: '',
            note: a.note || '',
            startTime: a.startTime || '09:00',
            endTime: a.endTime || '17:00'
          };
          // Add to home shop roster (not target shop)
          if (newRosters[rawHomeId] && !newRosters[rawHomeId].includes(eId)) {
            newRosters[rawHomeId].push(eId);
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

  const buildCurrentRotaPayload = () => {
    const assignments = [];
    const shopRosterPayload = [];

    shops.forEach(shop => {
      const workerIds = [...new Set(shopRosters[shop._id] || [])];
      shopRosterPayload.push({ shopId: shop._id, employeeIds: workerIds });

      workerIds.forEach(empId => {
        weekDays.forEach(day => {
          const cell = cells[`${shop._id}:${empId}:${day.dateKey}`];
          if (!cell) return;

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
          } else if (cell.status === 'OFF') {
            assignments.push({
              employeeId: empId,
              shopId: shop._id,
              dateKey: day.dateKey,
              startTime: '09:00',
              endTime: '17:00',
              status: 'OFF',
              note: '',
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

    return { assignments, shopRoster: shopRosterPayload, generationMethod: 'MANUAL' };
  };

  // Save Rota Draft
  const saveRota = async () => {
    if (conflicts.length > 0) {
      setError(`Resolve the ${conflicts.length} double-booking conflict(s) shown below before saving this rota.`);
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const payload = {
        ...buildCurrentRotaPayload(),
        revisePublished: currentRota?.status === 'PUBLISHED'
      };

      const res = await axios.put(`${API}/week/${weekStart}/draft`, payload);
      if (res.data?.rota) {
        setCurrentRota(res.data.rota);
      }
      setNotice('Weekly Rota draft saved successfully!');
    } catch (err) {
      const responseData = err?.response?.data;
      const validationErrors = [
        responseData?.validation?.errors,
        responseData?.errors,
        responseData?.details?.validation?.errors
      ].find(errors => Array.isArray(errors) && errors.length > 0);
      const msg = Array.isArray(validationErrors) && validationErrors.length
        ? `Rota draft could not be saved:\n${validationErrors.map(item => `• ${item}`).join('\n')}`
        : responseData?.message || err.message || 'Failed to save rota draft.';
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

  // ── Build the print HTML (shop-by-shop table, matches paper rota) ─────────
  const buildRotaHtml = () => {
    const DAY_LABELS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    const formatDate = (iso) => {
      const d = new Date(`${iso}T12:00:00Z`);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };
    let html = `
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:9px;padding:12px;color:#0f172a;background:#fff}
        h1{font-size:13px;text-align:center;margin-bottom:4px;font-weight:800;letter-spacing:.5px}
        .subtitle{font-size:8px;text-align:center;color:#64748b;margin-bottom:12px}
        .shop-block{margin-bottom:14px;border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;page-break-inside:avoid}
        .shop-title{background:#1e293b;color:#fff;text-align:center;font-size:10px;font-weight:800;padding:4px 8px;letter-spacing:.3px}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #e2e8f0;padding:3px 4px;text-align:center;font-size:7.5px}
        th{background:#f1f5f9;font-weight:700;color:#334155;font-size:7px}
        td.name-col{text-align:left;font-weight:700;background:#f8fafc;min-width:65px;max-width:65px;font-size:8px}
        .date-hdr{font-size:6.5px;color:#475569}
        .day-hdr{font-size:6.5px;color:#334155;font-weight:800}
        .avail{color:#059669}
        .off{color:#dc2626;font-weight:700;font-style:italic}
        .loaned{color:#7c3aed;font-weight:600}
        .dash{color:#94a3b8}
        .total-row td{background:#e2e8f0;font-weight:800;font-size:8px;color:#1e293b}
        .alt-row{background:#f8fafc}
        footer{text-align:center;font-size:7px;color:#94a3b8;margin-top:10px}
        @media print{body{padding:6px}@page{size:A4 landscape;margin:12mm 10mm}}
      </style>
      <h1>Weekly Staff Rota</h1>
      <div class="subtitle">${formatDate(weekDays[0].dateKey)} &ndash; ${formatDate(weekDays[6].dateKey)}</div>
    `;

    shops.forEach(shop => {
      const workerIds = shopRosters[shop._id] || [];
      if (workerIds.length === 0) return;

      html += `<div class="shop-block">
        <div class="shop-title">${shop.name}</div>
        <table>
          <thead>
            <tr>
              <th class="name-col" style="background:#f1f5f9">Name</th>
              ${weekDays.map(d => `<th class="date-hdr">${formatDate(d.dateKey).replace(/ \d{4}$/, '')}</th>`).join('')}
            </tr>
            <tr>
              <th class="name-col" style="background:#f1f5f9"></th>
              ${weekDays.map(d => `<th class="day-hdr">${DAY_LABELS[d.dayIndex]}</th>`).join('')}
            </tr>
          </thead>
          <tbody>`;

      const totals = new Array(7).fill(0);
      workerIds.forEach((empId, rowIdx) => {
        const emp = employees.find(e => e._id === empId);
        if (!emp) return;
        html += `<tr class="${rowIdx % 2 === 1 ? 'alt-row' : ''}">
          <td class="name-col">${emp.name}</td>`;

        weekDays.forEach((d, i) => {
          const display = getWorkerDayDisplay(shop._id, empId, d.dateKey);
          if (display.status === 'AVAILABLE' || display.status === 'CUSTOM') {
            totals[i]++;
          }
          const cssClass = display.status === 'LOANED'
            ? 'loaned'
            : display.status === 'OFF'
              ? 'off'
              : 'avail';
          html += `<td class="${cssClass}">${display.text}</td>`;
        });
        html += `</tr>`;
      });

      html += `<tr class="total-row">
        <td class="name-col">Total</td>
        ${totals.map(t => `<td>${t}</td>`).join('')}
      </tr>`;

      html += `</tbody></table></div>`;
    });

    html += `<footer>Generated by PIXX ROTA &middot; ${new Date().toLocaleDateString('en-GB')}</footer>`;
    return html;
  };

  // ── Print: open popup with styled rota table ─────────────────────────────
  const printRota = () => {
    const win = window.open('', '_blank', 'width=1200,height=850');
    if (!win) { alert('Pop-up blocked. Please allow pop-ups for this site.'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Weekly Rota – ${weekStart}</title></head><body>${buildRotaHtml()}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  };

  // ── PDF: download from backend (authenticated) ────────────────────────────
  const downloadPdf = async () => {
    try {
      const token = localStorage.getItem('pixx_token');
      const response = await axios.get(`${API}/week/${weekStart}/export.pdf`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Weekly_Rota_${weekStart}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert(err?.response?.data?.message || 'Could not download the current rota PDF.');
      console.error(err);
    }
  };


  // Calculate active totals per shop per day
  const getShopDayTotal = (shopId, dateKey) => {
    let count = 0;
    const countedEmployees = new Set();
    const workerIds = shopRosters[shopId] || [];
    workerIds.forEach(empId => {
      const display = getWorkerDayDisplay(shopId, empId, dateKey);
      if (display.status === 'AVAILABLE' || display.status === 'CUSTOM') {
        count++;
        countedEmployees.add(empId);
      }
    });

    shops.forEach(otherShop => {
      if (otherShop._id === shopId) return;
      const otherWorkers = shopRosters[otherShop._id] || [];
      otherWorkers.forEach(empId => {
        const cellKey = `${otherShop._id}:${empId}:${dateKey}`;
        const cell = cells[cellKey];
        if (!countedEmployees.has(empId) && cell && cell.status === 'LOANED' && cell.targetShopId === shopId) {
          count++;
          countedEmployees.add(empId);
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
              <><Maximize2 size={15} /> Fullscreen</>
            )}
          </button>

          {/* View Mode Switcher (Visible in both normal & fullscreen) */}
          <div className="rota-view-switch">
            <button
              className={`switch-tab ${viewMode === 'SHEET' ? 'active' : ''}`}
              onClick={() => setViewMode('SHEET')}
              title="Color-Coded Unified Spreadsheet Rota (Matches Template)"
            >
              Unified Sheet
            </button>
            <button
              className={`switch-tab ${viewMode === 'GRID' ? 'active' : ''}`}
              onClick={() => setViewMode('GRID')}
              title="Shop Card Matrix View"
            >
              Cards Matrix
            </button>
            <button
              className={`switch-tab ${viewMode === 'BOARD' ? 'active' : ''}`}
              onClick={() => setViewMode('BOARD')}
              title="Daily Pick & Drop Board"
            >
              Daily Board
            </button>
          </div>

          {/* Preview Last Week Toggle */}
          <button
            className={`btn btn-sm ${showPreview ? 'rota-btn-preview-active' : 'btn-outline'}`}
            onClick={togglePreview}
            disabled={prevRotaLoading}
            title="Preview last week's rota and highlight unavailable workers in RED"
          >
            {showPreview ? (
              <><EyeOff size={15} /> Exit Preview</>
            ) : (
              <><Eye size={15} /> {prevRotaLoading ? 'Loading…' : 'Preview Last Week'}</>
            )}
          </button>

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
            title="Print clean weekly rota sheet"
          >
            <Printer size={15} /> Print
          </button>
          <button
            className="btn btn-outline btn-sm rota-btn-action"
            onClick={downloadPdf}
            title="Download PDF rota (Color-Coded Multi-Shop Spreadsheet)"
          >
            <Download size={15} /> PDF
          </button>
          <button
            className="btn btn-outline btn-sm rota-btn-action"
            onClick={downloadExcel}
            title="Download Excel spreadsheet (Matches Uploaded Template)"
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

      {/* ── PREVIEW BANNER (WHEN ACTIVE) ─────────────────────────── */}
      {showPreview && (
        <div className="rota-preview-banner card" style={{ background: '#fef2f2', border: '1.5px solid #ef4444', padding: '12px 18px', marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#dc2626" />
            <div>
              <strong style={{ color: '#991b1b', fontSize: '13.5px' }}>
                Previewing Previous Week's Rota:
              </strong>
              <span style={{ color: '#7f1d1d', fontSize: '12.5px', marginLeft: '6px' }}>
                Workers who are <strong>NOT AVAILABLE</strong> or marked <strong>OFF</strong> are highlighted in <strong>RED ("NOT AVAIL")</strong>. Click on any red slot to see available workers on that day or transfer someone from another shop!
              </span>
            </div>
          </div>
          <button className="btn btn-sm btn-outline" onClick={() => setShowPreview(false)} style={{ borderColor: '#fca5a5', color: '#991b1b', fontWeight: 600 }}>
            Exit Preview
          </button>
        </div>
      )}

      {/* ── TOAST NOTIFICATIONS ──────────────────────────────────── */}
      {error && (
        <div className="rota-alert-msg rota-alert-error" role="alert">
          <AlertCircle size={18} />
          <span style={{ whiteSpace: 'pre-line' }}>{error}</span>
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
      {viewMode === 'BOARD' ? (
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
      ) : viewMode === 'SHEET' ? (
        /* ── UNIFIED ROTA SHEET (MATCHES SPREADSHEET TEMPLATE) ── */
        loading ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="spin-icon" style={{ marginBottom: '10px' }} />
            <div>Loading weekly rota schedule…</div>
          </div>
        ) : (
          <div id="rota-print-area" className="rota-excel-sheet">
            {/* Sheet Title Bar */}
            <div className="sheet-main-title-bar">
              <div className="sheet-title-text">ROTA</div>
              <div className="sheet-subtitle-text">({weekDays[0]?.fullDate} to {weekDays[6]?.fullDate})</div>
            </div>

            {/* Top Date Bar */}
            <div className="sheet-top-date-bar">
              <div className="sheet-th-corner"></div>
              {weekDays.map(d => (
                <div key={d.dateKey} className="sheet-th-date-col">
                  {d.fullDate.replace(/ \d{4}$/, '')}
                </div>
              ))}
            </div>

            {/* Stacked Shops */}
            {shops.map(shop => {
              const style = getShopStyle(shop.name);
              const workerIds = shopRosters[shop._id] || [];
              const isAddingWorker = addingWorkerShopId === shop._id;
              const availableToAdd = employees.filter(e => !workerIds.includes(String(e._id)));
              const matchingWorkers = availableToAdd.filter(emp =>
                `${emp.name || ''} ${emp.employeeId || ''}`.toLowerCase().includes(workerSearch.trim().toLowerCase())
              );

              return (
                <div
                  key={shop._id}
                  className="sheet-shop-section"
                  style={{ backgroundColor: style.bg }}
                >
                  {/* Shop Banner Row */}
                  <div
                    className="sheet-shop-header-row"
                    style={{ backgroundColor: style.excelBg || style.bg }}
                  >
                    <span className="sheet-shop-name-title" style={{ color: style.text }}>
                      {shop.name}
                    </span>
                    <div style={{ position: 'relative' }}>
                      <button
                        className="sheet-add-emp-btn"
                        onClick={() => {
                          setWorkerSearch('');
                          setAddingWorkerShopId(isAddingWorker ? null : shop._id);
                        }}
                      >
                        <Plus size={12} /> Add Worker
                      </button>
                      {isAddingWorker && (
                        <div className="add-worker-popover card">
                          <div className="add-worker-header">
                            <span>Add Worker to {shop.name}</span>
                            <button onClick={() => setAddingWorkerShopId(null)}><X size={14} /></button>
                          </div>
                          <input
                            type="search"
                            className="form-input"
                            placeholder="Search workers by name or ID"
                            value={workerSearch}
                            onChange={event => setWorkerSearch(event.target.value)}
                            style={{ margin: '8px 10px', width: 'calc(100% - 20px)' }}
                          />
                          <div className="add-worker-list">
                            {matchingWorkers.length === 0 ? (
                              <div style={{ padding: '12px', fontSize: '12px', color: '#94a3b8' }}>
                                {availableToAdd.length === 0
                                  ? 'All workers are already in this shop roster.'
                                  : 'No workers match your search.'}
                              </div>
                            ) : (
                              matchingWorkers.map(emp => (
                                <button
                                  key={emp._id}
                                  className="add-worker-item"
                                  disabled={emp.employmentStatus !== 'Active'}
                                  onClick={() => addWorkerToShop(shop._id, emp._id)}
                                >
                                  <strong>{emp.name}</strong>
                                  <span>
                                    {emp.employeeId}
                                    {emp.employmentStatus !== 'Active' && ` · ${emp.employmentStatus || 'Inactive'}`}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Subheader: Name & Dates */}
                  <div className="sheet-subhead-row dates-row" style={{ backgroundColor: style.excelBg || style.bg }}>
                    <div className="sheet-col-name">Name</div>
                    {weekDays.map(d => (
                      <div key={d.dateKey} className="sheet-col-day">
                        {d.fullDate.replace(/ \d{4}$/, '')}
                      </div>
                    ))}
                  </div>

                  {/* Subheader: Day of Week (SUNDAY, MONDAY...) */}
                  <div className="sheet-subhead-row days-row" style={{ backgroundColor: style.excelBg || style.bg }}>
                    <div className="sheet-col-name"></div>
                    {weekDays.map(d => (
                      <div key={d.dateKey} className="sheet-col-day sheet-day-name">
                        {d.dayName}
                      </div>
                    ))}
                  </div>

                  {/* Worker Rows */}
                  {workerIds.length === 0 ? (
                    <div className="sheet-empty-roster">
                      No workers assigned to {shop.name} yet. Click <strong>+ Add Worker</strong> above to start.
                    </div>
                  ) : (
                    workerIds.map((empId, empIdx) => {
                      const emp = employeeMap.get(empId);
                      const empName = emp?.name || 'Worker';

                      return (
                        <div key={empId} className={`sheet-worker-row ${empIdx % 2 === 1 ? 'sheet-row-alt' : ''}`}>
                          <div className="sheet-col-name sheet-worker-name-cell">
                            <span className="sheet-emp-name">{empName}</span>
                            <button
                              className="sheet-remove-btn"
                              onClick={() => removeWorkerFromShop(shop._id, empId)}
                              title="Remove worker from this shop roster"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>

                          {weekDays.map((d, dIdx) => {
                            const display = getWorkerDayDisplay(shop._id, empId, d.dateKey);
                            const displayText = display.text;
                            const displayStatus = display.status;

                            const conflicted = isCellConflicted(shop._id, empId, d.dateKey);
                            const isUnavailable = checkIsWorkerUnavailableInPreview(shop._id, empId, d.dateKey, dIdx);
                            const isPicked = pickedWorker?.employeeId === empId && pickedWorker?.dateKey === d.dateKey;

                            let cellText  = displayText;
                            let cellClass = 'sheet-cell-avail';

                            if (conflicted) {
                              cellClass = 'sheet-cell-conflict';
                              cellText  = '⚠️ Conflict';
                            } else if (displayStatus === 'OFF') {
                              cellClass = 'sheet-cell-off';
                              cellText  = 'OFF';
                            } else if (displayStatus === 'LOANED') {
                              cellClass = 'sheet-cell-loaned';
                              // cellText is already the shop name from server
                            } else if (displayStatus === 'CUSTOM') {
                              cellClass = 'sheet-cell-custom';
                            }

                            if (showPreview && isUnavailable) {
                              cellClass += ' sheet-cell-preview-red';
                            }

                            if (isPicked) {
                              cellClass += ' cell-picked-ring';
                            }

                            return (
                              <div
                                key={d.dateKey}
                                className={`sheet-col-day sheet-cell-interactive ${cellClass}`}
                                onClick={(e) => {
                                  if (showPreview && isUnavailable) {
                                    openAvailabilityModal(shop._id, empId, d.dateKey, d.dayName);
                                  } else {
                                    openCellPopover(shop._id, empId, d.dateKey, e);
                                  }
                                }}
                                title={showPreview && isUnavailable ? "Worker unavailable! Click to assign replacement or transfer from another shop." : "Click to edit status or transfer"}
                              >
                                {showPreview && isUnavailable && (
                                  <span className="preview-red-tag">NOT AVAIL</span>
                                )}
                                {/* Show coloured shop badge for loaned/cross-shop cells */}
                                {displayStatus === 'LOANED'
                                  ? (() => {
                                      const shopStyle = getShopStyle(cellText);
                                      return (
                                        <span
                                          className="rota-shop-pill"
                                          style={{
                                            background: shopStyle.pillBg,
                                            color: shopStyle.text,
                                            border: `1px solid ${shopStyle.border}`
                                          }}
                                        >
                                          {cellText}
                                        </span>
                                      );
                                    })()
                                  : <span>{cellText}</span>
                                }
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  )}

                  {/* Shop Total Row */}
                  <div
                    className="sheet-total-row"
                    style={{ backgroundColor: style.excelBg, borderTop: `2px solid ${style.border}` }}
                  >
                    <div className="sheet-col-name sheet-total-label" style={{ color: style.text }}>TOTAL</div>
                    {weekDays.map(d => (
                      <div key={d.dateKey} className="sheet-col-day sheet-total-val" style={{ fontWeight: 800, color: style.text }}>
                        {getShopDayTotal(shop._id, d.dateKey)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Grand Total Row at Bottom across all shops */}
            <div className="sheet-grand-total-row">
              <div className="sheet-col-name sheet-grand-total-label">Grand Total</div>
              {weekDays.map(d => {
                let grandSum = 0;
                shops.forEach(s => { grandSum += getShopDayTotal(s._id, d.dateKey); });
                return (
                  <div key={d.dateKey} className="sheet-col-day sheet-grand-total-val">
                    {grandSum}
                  </div>
                );
              })}
            </div>
          </div>
        )
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
              const availableToAdd = employees.filter(e => !workerIds.includes(String(e._id)));
              const matchingWorkers = availableToAdd.filter(emp =>
                `${emp.name || ''} ${emp.employeeId || ''}`.toLowerCase().includes(workerSearch.trim().toLowerCase())
              );

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
                          onClick={() => {
                            setWorkerSearch('');
                            setAddingWorkerShopId(isAddingWorker ? null : shop._id);
                          }}
                        >
                          <Plus size={14} /> Add Worker
                        </button>

                        {isAddingWorker && (
                          <div className="add-worker-popover card">
                            <div className="add-worker-header">
                              <span>Add Worker to {shop.name}</span>
                              <button onClick={() => setAddingWorkerShopId(null)}><X size={14} /></button>
                            </div>
                            <input
                              type="search"
                              className="form-input"
                              placeholder="Search workers by name or ID"
                              value={workerSearch}
                              onChange={event => setWorkerSearch(event.target.value)}
                              style={{ margin: '8px 10px', width: 'calc(100% - 20px)' }}
                            />
                            <div className="add-worker-list">
                              {matchingWorkers.length === 0 ? (
                                <div style={{ padding: '12px', fontSize: '12px', color: '#94a3b8' }}>
                                  {availableToAdd.length === 0
                                    ? 'All workers are already in this shop roster.'
                                    : 'No workers match your search.'}
                                </div>
                              ) : (
                                matchingWorkers.map(emp => (
                                  <button
                                    key={emp._id}
                                    className="add-worker-item"
                                    disabled={emp.employmentStatus !== 'Active'}
                                    onClick={() => addWorkerToShop(shop._id, emp._id)}
                                  >
                                    <strong>{emp.name}</strong>
                                    <span>
                                      {emp.employeeId}
                                      {emp.employmentStatus !== 'Active' && ` · ${emp.employmentStatus || 'Inactive'}`}
                                    </span>
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

                                {weekDays.map((day, dayIdx) => {
                                  const cellKey = `${shop._id}:${empId}:${day.dateKey}`;
                                  const cell = cells[cellKey] || { status: 'AVAILABLE' };
                                  const display = getWorkerDayDisplay(shop._id, empId, day.dateKey);
                                  const conflicted = isCellConflicted(shop._id, empId, day.dateKey);
                                  const isUnavailable = checkIsWorkerUnavailableInPreview(shop._id, empId, day.dateKey, dayIdx);
                                  const isPicked = pickedWorker?.employeeId === empId && pickedWorker?.dateKey === day.dateKey;

                                  let cellClass = 'rota-cell-btn';
                                  let cellLabel = display.text;
                                  let cellStyle = {};

                                  if (conflicted) {
                                    cellClass += ' cell-conflicted';
                                  } else if (display.status === 'OFF') {
                                    cellClass += ' cell-off';
                                  } else if (display.status === 'LOANED') {
                                    const targetStyle = getShopStyle(display.text);
                                    cellClass += ' cell-loaned';
                                    cellStyle = {
                                      backgroundColor: targetStyle.pillBg,
                                      color: targetStyle.text,
                                      borderColor: targetStyle.border
                                    };
                                  } else if (display.status === 'CUSTOM') {
                                    cellClass += ' cell-custom';
                                  } else {
                                    cellClass += ' cell-available';
                                  }

                                  if (showPreview && isUnavailable) {
                                    cellClass += ' sheet-cell-preview-red';
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
                                          onClick={(e) => {
                                            if (showPreview && isUnavailable) {
                                              openAvailabilityModal(shop._id, empId, day.dateKey, day.dayName);
                                            } else {
                                              openCellPopover(shop._id, empId, day.dateKey, e);
                                            }
                                          }}
                                          title={showPreview && isUnavailable ? "Worker unavailable! Click to assign replacement or transfer from another shop." : "Click to edit, or drag & drop to another shop"}
                                        >
                                          {conflicted && <span className="conflict-dot">⚠️</span>}
                                          {showPreview && isUnavailable && (
                                            <span className="preview-red-tag" style={{ marginRight: '4px' }}>NOT AVAIL</span>
                                          )}
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

      {/* ── FIND REPLACEMENT & TRANSFER WORKER MODAL ────────────────── */}
      {availModal && (
        <div className="rota-modal-backdrop" onClick={() => setAvailModal(null)}>
          <div className="avail-modal-card card" onClick={(e) => e.stopPropagation()}>
            <div className="avail-modal-header">
              <div>
                <div className="avail-modal-badge">
                  <UserX size={14} /> Worker Unavailable Slot
                </div>
                <h3 className="avail-modal-title">
                  Replace Slot at {availModal.shopName}
                </h3>
                <div className="avail-modal-subtitle">
                  📅 {availModal.dayName}, {weekDays.find(d => d.dateKey === availModal.dateKey)?.dateFormatted}
                  {' '}· Worker: <strong>{availModal.employeeName}</strong> {availModal.employeeCode ? `(${availModal.employeeCode})` : ''}
                </div>
              </div>
              <button className="popover-close-btn" onClick={() => setAvailModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="avail-modal-body">
              {/* Quick override button */}
              <div className="avail-override-bar">
                <span style={{ fontSize: '12px', color: '#475569' }}>
                  Is {availModal.employeeName} available to work?
                </span>
                <button className="btn btn-sm btn-outline" onClick={forceOriginalAvailable}>
                  <Check size={14} /> Keep {availModal.employeeName} as Available
                </button>
              </div>

              {/* Section 1: Available (Free) Workers */}
              <div className="avail-section">
                <div className="avail-section-header">
                  <UserCheck size={16} color="#16a34a" />
                  <strong>Available Workers on {availModal.dayName} ({availModal.availableWorkers.length})</strong>
                  <span className="avail-pill-hint">Not assigned anywhere today</span>
                </div>

                <div className="avail-workers-list">
                  {availModal.availableWorkers.length === 0 ? (
                    <div className="avail-empty-box">
                      <AlertCircle size={16} />
                      <span>No active workers are completely free on {availModal.dayName}. You can transfer a worker from another shop below.</span>
                    </div>
                  ) : (
                    availModal.availableWorkers.map(w => (
                      <div key={w._id} className="avail-worker-item">
                        <div className="avail-worker-info">
                          <strong className="avail-worker-name">{w.name}</strong>
                          <span className="avail-worker-id">{w.employeeId}</span>
                        </div>
                        <button
                          className="btn btn-sm btn-primary assign-worker-btn"
                          onClick={() => assignAvailableWorker(w._id)}
                        >
                          <Plus size={13} /> Assign to {availModal.shopName}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Section 2: Transfer / Borrow from Another Shop */}
              <div className="avail-section" style={{ marginTop: '16px' }}>
                <div className="avail-section-header">
                  <Move size={16} color="#2563eb" />
                  <strong>Transfer / Borrow from Another Shop ({availModal.transferrableWorkers.length})</strong>
                  <span className="avail-pill-hint">Currently scheduled at other shops today</span>
                </div>

                <div className="avail-workers-list">
                  {availModal.transferrableWorkers.length === 0 ? (
                    <div className="avail-empty-box">
                      <span>No workers scheduled at other shops to borrow from.</span>
                    </div>
                  ) : (
                    availModal.transferrableWorkers.map(tw => (
                      <div key={`${tw.currentShopId}:${tw.employeeId}`} className="avail-worker-item transfer-item">
                        <div className="avail-worker-info">
                          <strong className="avail-worker-name">{tw.employeeName}</strong>
                          <span className="transfer-from-badge">Working at: {tw.currentShopName}</span>
                        </div>
                        <button
                          className="btn btn-sm btn-outline transfer-worker-btn"
                          onClick={() => transferWorkerFromShop(tw.employeeId, tw.currentShopId)}
                        >
                          <ArrowRight size={13} /> Transfer to {availModal.shopName}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
