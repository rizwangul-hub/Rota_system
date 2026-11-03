import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Lock,
  Unlock,
  CheckCircle2,
  Calendar,
  Clock,
  Building2,
  LogOut,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  Send,
  Save,
  Check,
  FileDown
} from 'lucide-react';
import { useAuth } from './context/AuthContext';
import api, { API_BASE_URL } from './services/api';
import {
  formatUKDisplayDate,
  toDateString,
  formatTime12Hour,
  parseTimeInput,
  getSundayWeekStart
} from './utils/time';
import logoImg from './assets/app-logo.png';
import usmanAvatar from './assets/usman.png';
import adeelAvatar from './assets/adeel.jpg';
import RotaIntroAnimation from './components/RotaIntroAnimation';
import AttendanceCelebration from './components/AttendanceCelebration';
import InstallAppBanner from './components/InstallAppBanner';

// Time Input component with smart 12-hour AM/PM formatting
function AttendanceTimeInput({ value, onChange, editable, placeholder, fieldType }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!focused) {
      setDraft(value);
    }
  }, [value, focused]);

  return (
    <input
      type="text"
      disabled={!editable}
      value={focused ? draft : formatTime12Hour(value)}
      onFocus={() => {
        setDraft(formatTime12Hour(value));
        setFocused(true);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = parseTimeInput(draft, fieldType);
        if (parsed) {
          onChange(parsed);
          setDraft(parsed);
        }
        setFocused(false);
      }}
      placeholder={placeholder}
      style={{
        width: '100%',
        height: '38px',
        padding: '0 10px',
        backgroundColor: editable ? '#ffffff' : '#f1f5f9',
        border: '1.5px solid #cbd5e1',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 600,
        color: editable ? '#0f172a' : '#64748b',
        boxSizing: 'border-box'
      }}
    />
  );
}

export default function App() {
  const { user, token, login, logout, loading: authLoading } = useAuth();

  // Login form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Core attendance states
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [shops, setShops] = useState([]);
  const [workerRows, setWorkerRows] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Modern animation states
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return sessionStorage.getItem('pixx_rota_intro_shown') !== 'true';
    } catch {
      return true;
    }
  });
  const [showCelebration, setShowCelebration] = useState(false);

  // Native-style modal alert state
  const [alertModal, setAlertModal] = useState(null); // { title, message, buttons: [{ text, style, onClick }] }

  const showAlert = (title, message, buttons = [{ text: 'OK', onClick: () => setAlertModal(null) }]) => {
    setAlertModal({ title, message, buttons });
  };

  const rawDateString = toDateString(currentDate);

  // Load shops
  const loadShops = useCallback(async () => {
    try {
      const res = await api.get('/shops');
      return res.data?.success ? res.data.shops : [];
    } catch (err) {
      console.error('Error fetching shops:', err);
      return [];
    }
  }, []);

  // Load rota and attendance for date
  const loadRotaForDate = useCallback(async (dateObj) => {
    const dateStr = toDateString(dateObj);
    const weekStart = getSundayWeekStart(dateObj);

    // Fetch employees, existing attendance, default shop shift, AND Weekly Rota in parallel!
    const [empRes, attRes, shiftRes, rotaRes] = await Promise.all([
      api.get('/employees?status=Active').catch(() => ({ data: { success: false, employees: [] } })),
      api.get(`/attendance?dateString=${dateStr}`).catch(() => ({ data: { success: false, records: [] } })),
      api.get(`/shops/default-shift?date=${dateStr}`).catch(() => ({ data: { success: false } })),
      api.get(`/rota/week/${weekStart}`).catch(() => ({ data: { success: false } }))
    ]);

    const activeEmployees = empRes.data?.success ? empRes.data.employees : [];
    const existingAttendance = attRes.data?.success ? attRes.data.records : [];
    const defaultShiftStart = shiftRes.data?.success ? shiftRes.data.shiftStart || '09:00' : '09:00';
    const defaultShiftEnd = shiftRes.data?.success ? shiftRes.data.shiftEnd || '19:00' : '19:00';

    // Map existing saved attendance
    const attMap = {};
    existingAttendance.forEach((att) => {
      const empId = att.employee?._id || att.employee;
      if (empId) attMap[empId.toString()] = att;
    });

    // Map weekly rota assignments for this specific dateKey!
    // An employee can have multiple assignments in the weekly rota on a single date (e.g. loaned to another shop and marked OFF elsewhere).
    // We group all assignments for this dateKey by employeeId and resolve:
    // 1. Working assignments ('AVAILABLE', 'LOANED', 'CUSTOM', etc.) take precedence over 'OFF'.
    // 2. If a working assignment exists, the physical working shop and scheduled times are selected.
    // 3. If the employee only has 'OFF' (or 'ABSENT' / 'LEAVE') assignments on this dateKey, they are scheduled OFF -> set status to 'Absent' with no shop.
    const rotaByEmployee = {};
    const OFF_STATUSES = ['OFF', 'ABSENT', 'LEAVE', 'UNAVAILABLE'];

    if (rotaRes.data?.success && Array.isArray(rotaRes.data?.rota?.assignments)) {
      rotaRes.data.rota.assignments.forEach((asg) => {
        const asgDateStr = typeof asg.dateKey === 'string'
          ? asg.dateKey.slice(0, 10)
          : (asg.dateKey ? new Date(asg.dateKey).toISOString().slice(0, 10) : '');

        if (asgDateStr === dateStr && asg.employeeId) {
          const empId = (asg.employeeId?._id || asg.employeeId).toString();
          if (!rotaByEmployee[empId]) rotaByEmployee[empId] = [];
          rotaByEmployee[empId].push(asg);
        }
      });
    }

    const rotaResolution = {};
    Object.keys(rotaByEmployee).forEach((empId) => {
      const asgs = rotaByEmployee[empId];
      // Find active working assignment
      const workingAsg = asgs.find(
        (a) => a.status && !OFF_STATUSES.includes(String(a.status).toUpperCase())
      );

      if (workingAsg) {
        // Physical shop where the worker is assigned to work
        const workingShopId = (workingAsg.status === 'LOANED' || (workingAsg.homeShopId && workingAsg.homeShopId.toString() !== workingAsg.shopId?.toString()))
          ? (workingAsg.shopId?._id || workingAsg.shopId)
          : (workingAsg.shopId?._id || workingAsg.shopId || workingAsg.homeShopId);

        rotaResolution[empId] = {
          isWorking: true,
          isOff: false,
          shopId: workingShopId ? workingShopId.toString() : undefined,
          startTime: workingAsg.startTime,
          endTime: workingAsg.endTime,
          assignment: workingAsg
        };
      } else if (asgs.length > 0 && asgs.every((a) => OFF_STATUSES.includes(String(a.status || '').toUpperCase()))) {
        // Scheduled OFF across the board
        rotaResolution[empId] = {
          isWorking: false,
          isOff: true,
          shopId: undefined,
          startTime: '',
          endTime: '',
          assignment: asgs[0]
        };
      }
    });

    const rows = activeEmployees.map((emp) => {
      const empIdStr = emp._id.toString();
      const existing = attMap[empIdStr];
      const rotaInfo = rotaResolution[empIdStr];

      if (existing) {
        const isLocked = ['Checked', 'Finalized'].includes(existing.approvalStatus);
        const isAbsent = existing.status === 'Absent';
        return {
          attendanceId: existing._id,
          employeeId: emp._id,
          employeeName: existing.employeeName || emp.name,
          empCode: existing.employeeId || emp.employeeId,
          shopId: existing.shop?._id || existing.shop?.toString(),
          shiftStart: isAbsent ? '' : existing.shiftStart || defaultShiftStart,
          shiftEnd: isAbsent ? '' : existing.shiftEnd || defaultShiftEnd,
          timeReached: isAbsent ? '' : existing.timeReached || existing.shiftStart || defaultShiftStart,
          workerEndTime: isAbsent ? '' : existing.workerEndTime || existing.shiftEnd || defaultShiftEnd,
          status: existing.status || 'Present',
          remarks: existing.remarks || '',
          recordedShopName: existing.shopName || '',
          recordedShopId: existing.shop?._id || existing.shop?.toString(),
          approvalStatus: existing.approvalStatus || 'Pending Review',
          isLocked,
          isSaved: true,
          fromWeeklyRota: false
        };
      } else if (rotaInfo && rotaInfo.isOff) {
        // ── AUTO-SET OFF / ABSENT FROM WEEKLY ROTA (NO SHOP) ─────────────────
        return {
          employeeId: emp._id,
          employeeName: emp.name,
          empCode: emp.employeeId,
          shopId: undefined,
          shiftStart: '',
          shiftEnd: '',
          timeReached: '',
          workerEndTime: '',
          status: 'Absent',
          remarks: '',
          isLocked: false,
          isSaved: false,
          fromWeeklyRota: true
        };
      } else {
        // ── AUTO-SELECT SHOP FROM WEEKLY ROTA IF ASSIGNED BY ADMIN ─────────────────
        let autoShopId = undefined;
        let isFromRota = false;
        let start = defaultShiftStart;
        let end = defaultShiftEnd;

        if (rotaInfo && rotaInfo.isWorking && rotaInfo.shopId) {
          autoShopId = rotaInfo.shopId;
          isFromRota = true;
          if (rotaInfo.startTime) start = rotaInfo.startTime;
          if (rotaInfo.endTime) end = rotaInfo.endTime;
        } else if (emp.assignedShop) {
          autoShopId = (emp.assignedShop?._id || emp.assignedShop).toString();
        }

        // Fast shop timing adjustments
        const assignedShopObj = shops.find((s) => (s._id || s.id) === autoShopId);
        const isEdgware = assignedShopObj && /edgware/i.test(assignedShopObj.name);
        const isArsalan = typeof emp.name === 'string' && /ars[al]*an/i.test(emp.name);
        const dayOfWeek = dateObj.getDay();

        if (isEdgware) {
          start = dayOfWeek === 0 ? '11:00' : '09:30';
          end = '18:30';
        }
        if (isArsalan) {
          start = dayOfWeek === 6 ? '09:00' : dayOfWeek === 0 ? '11:00' : '10:00';
          end = isEdgware ? '18:30' : dayOfWeek === 0 ? '17:00' : dayOfWeek === 6 ? '18:00' : '19:00';
        }

        return {
          employeeId: emp._id,
          employeeName: emp.name,
          empCode: emp.employeeId,
          shopId: autoShopId,
          shiftStart: start,
          shiftEnd: end,
          timeReached: start,
          workerEndTime: end,
          status: 'Present',
          remarks: '',
          isLocked: false,
          isSaved: false,
          fromWeeklyRota: isFromRota
        };
      }
    });

    return rows;
  }, [shops]);

  // Initial load of shops
  useEffect(() => {
    if (!token) return;
    loadShops().then((loaded) => {
      setShops(loaded);
    });
  }, [token, loadShops]);

  // Load attendance data whenever date or shops change
  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoadingData(true);
    loadRotaForDate(currentDate)
      .then((data) => {
        if (active) setWorkerRows(data);
      })
      .catch((err) => {
        console.error('Error loading data:', err);
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });
    return () => { active = false; };
  }, [token, currentDate, loadRotaForDate]);

  const refreshRotaForDate = async (dateObj) => {
    setLoadingData(true);
    try {
      const data = await loadRotaForDate(dateObj);
      setWorkerRows(data);
    } catch (err) {
      console.error('Error refreshing data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  // Update a single field on a worker row
  const handleUpdateRow = (index, field, value) => {
    const updated = [...workerRows];
    if (updated[index].isLocked) {
      showAlert('Record Locked', 'This attendance has been approved and cannot be modified.');
      return;
    }

    if (field === 'status' && value === 'Absent') {
      updated[index] = {
        ...updated[index],
        status: 'Absent',
        shopId: undefined,
        shiftStart: '',
        shiftEnd: '',
        timeReached: '',
        workerEndTime: '',
        fromWeeklyRota: false
      };
    } else if (field === 'status' && value !== 'Absent' && updated[index].status === 'Absent') {
      const defaultStart = '09:00';
      const defaultEnd = '19:00';
      updated[index] = {
        ...updated[index],
        status: value,
        shiftStart: updated[index].shiftStart || defaultStart,
        shiftEnd: updated[index].shiftEnd || defaultEnd,
        timeReached: updated[index].timeReached || defaultStart,
        workerEndTime: updated[index].workerEndTime || defaultEnd,
        fromWeeklyRota: false
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setWorkerRows(updated);
  };

  // Handle changing a shop pill
  const handleShopChange = async (index, shopId) => {
    const row = workerRows[index];
    if (row.isLocked || row.shopId === shopId) return;

    const selectedShop = shops.find((s) => (s._id || s.id) === shopId);
    const isEdgware = selectedShop && /edgware/i.test(selectedShop.name);
    const isArsalan = typeof row.employeeName === 'string' && /ars[al]*an/i.test(row.employeeName);
    const dayOfWeek = currentDate.getDay();

    let fastStart = isEdgware ? (dayOfWeek === 0 ? '11:00' : '09:30') : (dayOfWeek === 0 ? '11:00' : '09:00');
    let fastEnd = isEdgware ? '18:30' : (dayOfWeek === 0 ? '17:00' : dayOfWeek === 6 ? '18:00' : '19:00');

    if (isArsalan) {
      fastStart = dayOfWeek === 6 ? '09:00' : dayOfWeek === 0 ? '11:00' : '10:00';
      fastEnd = isEdgware ? '18:30' : dayOfWeek === 0 ? '17:00' : dayOfWeek === 6 ? '18:00' : '19:00';
    }

    setWorkerRows((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const shouldUpdateTimes = !item.isSaved || item.shiftStart === item.timeReached || isEdgware || isArsalan;
        return {
          ...item,
          shopId,
          fromWeeklyRota: false, // User manually changed it
          shiftStart: fastStart,
          shiftEnd: fastEnd,
          timeReached: shouldUpdateTimes ? fastStart : item.timeReached,
          workerEndTime: shouldUpdateTimes ? fastEnd : item.workerEndTime,
          loadingShopShift: true
        };
      })
    );

    try {
      const response = await api.get(
        `/shops/default-shift?date=${rawDateString}&shopId=${shopId}&employeeId=${row.employeeId}`
      );
      const shiftStart = response.data?.shiftStart || fastStart;
      const shiftEnd = response.data?.shiftEnd || fastEnd;
      setWorkerRows((current) =>
        current.map((item, itemIndex) => {
          if (itemIndex !== index) return item;
          const useShopDefaults = !item.isSaved || item.timeReached === fastStart || item.timeReached === item.shiftStart;
          return {
            ...item,
            shopId,
            shiftStart,
            shiftEnd,
            timeReached: useShopDefaults ? shiftStart : item.timeReached,
            workerEndTime: useShopDefaults ? shiftEnd : item.workerEndTime,
            loadingShopShift: false
          };
        })
      );
    } catch {
      setWorkerRows((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index ? { ...item, loadingShopShift: false } : item
        )
      );
    }
  };

  // Date Navigation
  const handlePrevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNextDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Direct Download Daily Attendance PDF (Exact matching Admin/Sarfraz PDF report)
  const handleDownloadDailyPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const res = await api.get('/reports/daily-attendance/pdf', {
        params: { date: rawDateString },
        responseType: 'blob'
      });

      const contentType = res.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        const errJson = JSON.parse(text);
        throw new Error(errJson.message || 'Error generating PDF.');
      }

      const fileName = `Daily_Attendance_${rawDateString}.pdf`;
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }, 1500);
    } catch (err) {
      showAlert(
        'PDF Download Failed',
        err.message || err.response?.data?.message || 'Could not download daily attendance PDF.'
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Single Worker Save
  const handleSaveSingleWorker = async (index) => {
    const row = workerRows[index];
    if (row.isLocked) {
      showAlert('Record Locked', 'Approved records cannot be edited.');
      return;
    }
    const isAbsent = row.status === 'Absent';
    if (!isAbsent && !row.shopId) {
      showAlert('Select a Shop', `Choose the shop where ${row.employeeName} worked before saving attendance.`);
      return;
    }

    const updated = [...workerRows];
    updated[index].saving = true;
    setWorkerRows(updated);

    try {
      const res = await api.post('/attendance', {
        employeeId: row.employeeId,
        shopId: isAbsent ? undefined : row.shopId,
        date: rawDateString,
        shiftStart: isAbsent ? undefined : row.shiftStart,
        shiftEnd: isAbsent ? undefined : row.shiftEnd,
        timeReached: isAbsent ? undefined : row.timeReached,
        workerEndTime: isAbsent ? undefined : row.workerEndTime,
        status: row.status,
        remarks: row.remarks
      });

      if (res.data?.success) {
        const next = [...workerRows];
        const shopObj = shops.find((s) => s._id === row.shopId);
        next[index] = {
          ...next[index],
          attendanceId: res.data.record?._id || next[index].attendanceId,
          status: res.data.record?.status || next[index].status,
          isSaved: true,
          approvalStatus: 'Pending Review',
          recordedShopName: isAbsent ? '' : shopObj?.name || '',
          recordedShopId: isAbsent ? undefined : row.shopId,
          saving: false
        };
        setWorkerRows(next);
        showAlert(
          'Attendance Saved',
          `Attendance for ${row.employeeName} saved successfully (${row.status} — ${isAbsent ? 'Absent' : shopObj?.name || 'Shop'}).`
        );
      }
    } catch (err) {
      const next = [...workerRows];
      next[index].saving = false;
      setWorkerRows(next);
      showAlert('Save Failed', err.response?.data?.message || 'Error saving attendance.');
    }
  };

  // Save all attendance batch
  const handleSaveAllAttendance = async () => {
    if (!workerRows.length) {
      showAlert('Notice', 'There are no active workers to record.');
      return;
    }
    if (workerRows.every((row) => row.isLocked)) {
      showAlert('Nothing to Submit', 'All attendance records for this date have already been checked.');
      return;
    }
    const workersWithoutShop = workerRows.filter(
      (row) => !row.isLocked && row.status !== 'Absent' && !row.shopId
    );
    if (workersWithoutShop.length) {
      const names = workersWithoutShop.map((row) => row.employeeName).join(', ');
      showAlert('Shop Required', `Please choose the work location for every worker before submitting:\n\n${names}`);
      return;
    }

    const submittedRows = workerRows.filter((row) => !row.isLocked);
    setSavingAll(true);
    try {
      const res = await api.post(
        '/attendance/batch',
        {
          date: rawDateString,
          records: submittedRows.map((r) => ({
            employeeId: r.employeeId,
            shopId: r.status === 'Absent' ? undefined : r.shopId,
            shiftStart: r.status === 'Absent' ? undefined : r.shiftStart,
            shiftEnd: r.status === 'Absent' ? undefined : r.shiftEnd,
            timeReached: r.status === 'Absent' ? undefined : r.timeReached,
            workerEndTime: r.status === 'Absent' ? undefined : r.workerEndTime,
            status: r.status,
            remarks: r.remarks
          }))
        },
        { timeout: 60000 }
      );

      if (res.data?.success) {
        setShowCelebration(true);
        void refreshRotaForDate(currentDate);
      }
    } catch (err) {
      showAlert('Save Failed', err.response?.data?.message || 'Failed to submit batch attendance.');
    } finally {
      setSavingAll(false);
    }
  };

  // Login handler
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      showAlert('Required', 'Please enter username and password.');
      return;
    }
    setLoginLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      showAlert('Login Failed', err.response?.data?.message || err.message || 'Invalid credentials');
    } finally {
      setLoginLoading(false);
    }
  };

  // 1. UNLOGGED VIEW: Exact Usman Mobile Login
  if (!token) {
    return (
      <div className="mobile-app-shell">
        {showIntro && <RotaIntroAnimation onComplete={() => setShowIntro(false)} />}
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '380px',
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            padding: '28px 24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '84px',
              height: '84px',
              borderRadius: '20px',
              backgroundColor: '#f8fafc',
              border: '2px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              overflow: 'hidden',
              padding: '6px'
            }}>
              <img src={logoImg} alt="Pixx Rota" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>

            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px', marginBottom: '2px' }}>
              ATTENDANCE ROTA
            </h1>
            <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
              Pixx Technologies Attendance Web
            </p>
            <span style={{
              display: 'inline-block',
              marginTop: '4px',
              fontSize: '11px',
              color: '#2563eb',
              fontWeight: 700,
              backgroundColor: '#eff6ff',
              padding: '3px 10px',
              borderRadius: '12px'
            }}>
              Attendance Operator
            </span>

            <form onSubmit={handleLoginSubmit} style={{ marginTop: '24px', textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Username
              </label>
              <input
                type="text"
                autoCapitalize="none"
                placeholder="Username (usman or adeel)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '14px',
                  marginBottom: '14px',
                  boxSizing: 'border-box'
                }}
              />

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Password
              </label>
              <div style={{ position: 'relative', width: '100%', marginBottom: '20px' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 40px 0 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                style={{
                  width: '100%',
                  height: '44px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 700,
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
                }}
              >
                {loginLoading ? (
                  <RefreshCw size={18} className="spin" />
                ) : (
                  'Log In to Rota System'
                )}
              </button>
            </form>

            {/* Mobile Web View PWA Install Option */}
            <InstallAppBanner />
          </div>
        </div>

        {/* Alert Modal */}
        {alertModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '320px',
              width: '100%',
              padding: '20px',
              textAlign: 'center',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                {alertModal.title}
              </h3>
              <p style={{ fontSize: '13px', color: '#475569', marginBottom: '16px', whiteSpace: 'pre-line' }}>
                {alertModal.message}
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                {alertModal.buttons.map((b, idx) => (
                  <button
                    key={idx}
                    onClick={b.onClick}
                    style={{
                      flex: 1,
                      padding: '8px 14px',
                      backgroundColor: b.style === 'cancel' ? '#f1f5f9' : '#2563eb',
                      color: b.style === 'cancel' ? '#475569' : '#ffffff',
                      fontWeight: 700,
                      borderRadius: '8px',
                      fontSize: '13px'
                    }}
                  >
                    {b.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. AUTHENTICATED VIEW: Usman & Adeel Attendance Entry Web
  const savedCount = workerRows.filter((w) => w.isSaved).length;
  const isAdeel = (user?.username === 'adeel') || (typeof user?.name === 'string' && /adeel/i.test(user.name));
  const isUsman = (user?.username === 'usman') || (typeof user?.name === 'string' && /usman/i.test(user.name));
  const operatorDisplayName = user?.name || (isAdeel ? 'Adeel Ahmed' : (isUsman ? 'Usman Salahuddin' : 'Attendance Operator'));
  const operatorPhoto = isAdeel ? adeelAvatar : (isUsman ? usmanAvatar : logoImg);

  return (
    <div className="mobile-app-shell">
      {/* 1. App Launch Intro Animation */}
      {showIntro && <RotaIntroAnimation onComplete={() => setShowIntro(false)} />}

      {/* 2. Attendance Submission Celebration Animation */}
      <AttendanceCelebration
        show={showCelebration}
        onClose={() => setShowCelebration(false)}
        recipientName="Sarfraz"
      />

      {/* Top Header */}
      <header style={{
        backgroundColor: '#0f172a',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        borderBottom: '1px solid #1e293b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: '#1e293b',
            border: '2px solid #3b82f6',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <img
              src={operatorPhoto}
              alt={operatorDisplayName}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center top'
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
              {operatorDisplayName}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              Attendance Operator
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleDownloadDailyPdf}
            disabled={downloadingPdf}
            title="Download Daily Attendance PDF"
            style={{
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid #334155',
              cursor: downloadingPdf ? 'wait' : 'pointer'
            }}
          >
            {downloadingPdf ? (
              <RefreshCw size={13} className="spin" color="#60a5fa" />
            ) : (
              <FileDown size={14} color="#f87171" />
            )}
            <span>PDF</span>
          </button>

          <button
            onClick={logout}
            style={{
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid #334155'
            }}
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main style={{ padding: '16px', flex: 1, paddingBottom: '90px' }}>
        {/* Date Selector Banner Card */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)',
          borderRadius: '16px',
          padding: '16px',
          color: '#ffffff',
          boxShadow: '0 10px 15px -3px rgba(30, 58, 138, 0.25)',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#93c5fd', letterSpacing: '0.5px' }}>
                UK ATTENDANCE DATE
              </div>
              <div style={{ fontSize: '19px', fontWeight: 800, marginTop: '2px' }}>
                {formatUKDisplayDate(currentDate)}
              </div>
            </div>
            <div style={{
              fontSize: '11px',
              color: '#bfdbfe',
              fontWeight: 600,
              textAlign: 'right',
              maxWidth: '140px',
              lineHeight: 1.3
            }}>
              Shops auto-filled from weekly rota
            </div>
          </div>

          {/* Date Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={handlePrevDay}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                flex: '0 0 auto',
                backdropFilter: 'blur(4px)'
              }}
            >
              ◀ Prev Day
            </button>

            <button
              onClick={handleToday}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                flex: 1,
                textAlign: 'center',
                backdropFilter: 'blur(4px)'
              }}
            >
              Today (UK)
            </button>

            <button
              onClick={handleNextDay}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                flex: '0 0 auto',
                backdropFilter: 'blur(4px)'
              }}
            >
              Next Day ▶
            </button>
          </div>

          {/* Direct Download Daily Attendance PDF Button */}
          <button
            type="button"
            onClick={handleDownloadDailyPdf}
            disabled={downloadingPdf}
            style={{
              marginTop: '12px',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 800,
              border: 'none',
              cursor: downloadingPdf ? 'wait' : 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              transition: 'transform 0.1s, opacity 0.15s',
              opacity: downloadingPdf ? 0.8 : 1
            }}
          >
            {downloadingPdf ? (
              <RefreshCw size={15} className="spin" color="#2563eb" />
            ) : (
              <FileDown size={16} color="#dc2626" />
            )}
            <span>{downloadingPdf ? 'Generating Daily PDF...' : 'Download Daily Attendance PDF'}</span>
          </button>
        </div>

        {/* Workers List Section Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          padding: '0 4px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
            Workers ({workerRows.length})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {loadingData ? (
              <RefreshCw size={14} color="#2563eb" className="spin" />
            ) : (
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                {savedCount} / {workerRows.length} Recorded
              </span>
            )}
            <button
              onClick={() => refreshRotaForDate(currentDate)}
              title="Refresh attendance records"
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <RefreshCw size={14} className={loadingData ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Worker Cards */}
        {workerRows.map((row, idx) => {
          return (
            <div
              key={row.employeeId}
              style={{
                backgroundColor: row.isLocked ? '#f1f5f9' : '#ffffff',
                opacity: row.isLocked ? 0.85 : 1,
                borderRadius: '14px',
                padding: '14px',
                marginBottom: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}
            >
              {/* Card Header: Name, ID, Badges, Status Pill Buttons */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '10px',
                marginBottom: '10px',
                gap: '8px'
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                      {row.employeeName}
                    </span>
                    {row.isLocked ? (
                      <span style={{
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        🔒 Locked
                      </span>
                    ) : row.isSaved ? (
                      <span style={{
                        backgroundColor: '#dcfce7',
                        color: '#166534',
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        ✓ Saved
                      </span>
                    ) : null}
                  </div>

                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    ID: {row.empCode}
                  </div>
                </div>

                {/* Status Selector Buttons */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['Present', 'Late', 'Half', 'Absent'].map((st) => {
                    const isActive = row.status === st;
                    let activeBg = '#2563eb';
                    let activeBorder = '#1d4ed8';
                    let activeTextColor = '#ffffff';
                    if (st === 'Present') { activeBg = '#15803d'; activeBorder = '#166534'; }
                    else if (st === 'Late') { activeBg = '#d97706'; activeBorder = '#b45309'; }
                    else if (st === 'Half') { activeBg = '#0284c7'; activeBorder = '#0369a1'; }
                    else if (st === 'Absent') { activeBg = '#dc2626'; activeBorder = '#b91c1c'; }

                    return (
                      <button
                        key={st}
                        disabled={row.isLocked}
                        onClick={() => handleUpdateRow(idx, 'status', st)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: isActive ? 800 : 600,
                          backgroundColor: isActive ? activeBg : '#f1f5f9',
                          borderColor: isActive ? activeBorder : '#e2e8f0',
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          color: isActive ? activeTextColor : '#475569',
                          cursor: row.isLocked ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Card Body: Absent vs Active Shift */}
              {row.status === 'Absent' ? (
                <div style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#b91c1c',
                  fontWeight: 600,
                  marginBottom: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>Absent — no shop or time details are needed.</span>
                  {row.fromWeeklyRota && (
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#b91c1c',
                      backgroundColor: '#fee2e2',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid #fca5a5'
                    }}>
                      ✓ OFF in Weekly Rota
                    </span>
                  )}
                </div>
              ) : (
                <>
                  {/* Shop Selection with Rota Auto-Select Indicator */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                        Shop where this worker worked
                      </span>
                      {row.fromWeeklyRota && (
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#2563eb',
                          backgroundColor: '#eff6ff',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          border: '1px solid #bfdbfe'
                        }}>
                          ✓ Auto from Rota
                        </span>
                      )}
                    </div>

                    <div className="horizontal-pills">
                      {shops.map((shop) => {
                        const isSelected = row.shopId === shop._id;
                        return (
                          <button
                            key={shop._id}
                            type="button"
                            disabled={row.isLocked}
                            onClick={() => handleShopChange(idx, shop._id)}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: isSelected ? 800 : 500,
                              whiteSpace: 'nowrap',
                              backgroundColor: isSelected ? '#2563eb' : '#f1f5f9',
                              color: isSelected ? '#ffffff' : '#334155',
                              border: isSelected ? '1px solid #1d4ed8' : '1px solid #e2e8f0',
                              boxShadow: isSelected ? '0 2px 4px rgba(37,99,235,0.2)' : 'none',
                              cursor: row.isLocked ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {shop.name}
                          </button>
                        );
                      })}
                    </div>
                    {!row.shopId && !row.isLocked && (
                      <div style={{ fontSize: '11px', color: '#b45309', marginTop: '4px', fontWeight: 600 }}>
                        Select the shop for this worker before submitting attendance.
                      </div>
                    )}
                  </div>

                  {/* Scheduled Shift Times */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Shift Start
                      </span>
                      <AttendanceTimeInput
                        editable={!row.isLocked}
                        value={row.shiftStart}
                        onChange={(val) => handleUpdateRow(idx, 'shiftStart', val)}
                        placeholder="9:00 AM"
                        fieldType="start"
                      />
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Shift End
                      </span>
                      <AttendanceTimeInput
                        editable={!row.isLocked}
                        value={row.shiftEnd}
                        onChange={(val) => handleUpdateRow(idx, 'shiftEnd', val)}
                        placeholder="5:00 PM"
                        fieldType="end"
                      />
                    </div>
                  </div>

                  {/* Actual Arrival & Leave Times */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Arrival (Reached)
                      </span>
                      <AttendanceTimeInput
                        editable={!row.isLocked}
                        value={row.timeReached}
                        onChange={(val) => handleUpdateRow(idx, 'timeReached', val)}
                        placeholder="9:00 AM"
                        fieldType="start"
                      />
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Leave (Left)
                      </span>
                      <AttendanceTimeInput
                        editable={!row.isLocked}
                        value={row.workerEndTime}
                        onChange={(val) => handleUpdateRow(idx, 'workerEndTime', val)}
                        placeholder="5:00 PM"
                        fieldType="end"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Remarks and Quick Save button */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                <input
                  type="text"
                  disabled={row.isLocked}
                  placeholder="Optional notes or reasons for lateness..."
                  value={row.remarks || ''}
                  onChange={(e) => handleUpdateRow(idx, 'remarks', e.target.value)}
                  style={{
                    flex: 1,
                    height: '36px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '12px',
                    backgroundColor: row.isLocked ? '#f1f5f9' : '#ffffff',
                    color: '#0f172a'
                  }}
                />

                {!row.isLocked && (
                  <button
                    onClick={() => handleSaveSingleWorker(idx)}
                    disabled={row.saving}
                    style={{
                      height: '36px',
                      padding: '0 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 800,
                      backgroundColor: row.isSaved ? '#15803d' : '#2563eb',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: row.isSaved
                        ? '0 2px 6px rgba(21, 128, 61, 0.3)'
                        : '0 2px 6px rgba(37, 99, 235, 0.3)'
                    }}
                  >
                    {row.saving ? (
                      <RefreshCw size={14} className="spin" />
                    ) : row.isSaved ? (
                      <>
                        <Check size={14} />
                        <span>Update</span>
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        <span>Save</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {workerRows.length === 0 && !loadingData && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8' }}>
            No active workers available for this date.
          </div>
        )}
      </main>

      {/* Floating Bottom Action Bar: Submit Attendance to Sarfraz */}
      {workerRows.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          padding: '12px 16px',
          backgroundColor: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.06)',
          zIndex: 40
        }}>
          <button
            onClick={handleSaveAllAttendance}
            disabled={savingAll}
            style={{
              width: '100%',
              maxWidth: '448px',
              height: '46px',
              backgroundColor: '#16a34a',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 800,
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)'
            }}
          >
            {savingAll ? (
              <RefreshCw size={18} className="spin" />
            ) : (
              <>
                <Send size={16} />
                <span>Submit Attendance to Sarfraz</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Native-style Modal Alert */}
      {alertModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '340px',
            width: '100%',
            padding: '20px',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
              {alertModal.title}
            </h3>
            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '18px', whiteSpace: 'pre-line' }}>
              {alertModal.message}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              {alertModal.buttons.map((b, idx) => (
                <button
                  key={idx}
                  onClick={b.onClick}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    backgroundColor: b.style === 'cancel' ? '#f1f5f9' : '#2563eb',
                    color: b.style === 'cancel' ? '#475569' : '#ffffff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}
                >
                  {b.text}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
