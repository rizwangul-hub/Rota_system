import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3,
  Download, History, Mic, Plus, RefreshCw, Save, Sparkles, Trash2, Users
} from 'lucide-react';
import { API_BASE_URL } from '../context/AuthContext';
import './WeeklyRotaPlanner.css';

const API = `${API_BASE_URL}/rota`;
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const idOf = (record) => String(record?._id ?? record?.id ?? '');
const nameOf = (record) => record?.name || record?.fullName || [record?.firstName, record?.lastName].filter(Boolean).join(' ') || 'Unnamed employee';
const entityId = (value) => (value && typeof value === 'object' ? idOf(value) : String(value ?? ''));
const dateKey = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const todayUKDateKey = (date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const weekdayIndex = (date) => date.getUTCDay();
const sundayOf = (value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - weekdayIndex(date));
  return dateKey(date);
};
const weekDates = (start) => Array.from({ length: 7 }, (_, index) => {
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + index);
  return date;
});
const showDate = (value, options = { day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'Europe/London' }).format(new Date(`${value}T12:00:00.000Z`));
const unwrapList = (data, key) => {
  const candidate = data?.[key] ?? data?.data?.[key] ?? data?.data;
  return Array.isArray(candidate) ? candidate : [];
};
const getAssignments = (rota) => Array.isArray(rota?.assignments) ? rota.assignments : [];
const formatError = (error, fallback) => {
  const response = error?.response?.data;
  const validationErrors = response?.validation?.errors;
  if (Array.isArray(validationErrors) && validationErrors.length) {
    return `${response.message || fallback}\n${validationErrors.join('\n')}`;
  }
  return response?.message || response?.error || error?.message || fallback;
};
const assignmentKey = (item, index) => item._editKey || idOf(item) || index;
const assignmentSignature = (item) => JSON.stringify({
  employeeId: entityId(item.employeeId ?? item.employee),
  shopId: entityId(item.shopId ?? item.shop),
  dateKey: String(item.dateKey ?? item.date ?? '').slice(0, 10),
  startTime: item.startTime,
  endTime: item.endTime,
  locked: Boolean(item.locked)
});
const assignmentChangeCount = (previous, next) => {
  const counts = (items) => items.reduce((map, item) => {
    const signature = assignmentSignature(item);
    map.set(signature, (map.get(signature) || 0) + 1);
    return map;
  }, new Map());
  const previousCounts = counts(previous);
  const nextCounts = counts(next);
  const signatures = new Set([...previousCounts.keys(), ...nextCounts.keys()]);
  const changedEntries = [...signatures].reduce((total, signature) =>
    total + Math.abs((previousCounts.get(signature) || 0) - (nextCounts.get(signature) || 0)), 0
  );
  return Math.ceil(changedEntries / 2);
};
const assignmentHours = (item) => {
  if (!item.startTime || !item.endTime) return '—';
  const [startHour, startMinute] = item.startTime.split(':').map(Number);
  const [endHour, endMinute] = item.endTime.split(':').map(Number);
  return `${Math.max(0, ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60).toFixed(1)}h`;
};
const validIntervals = (intervals) => {
  if (!intervals?.length) return false;
  const normalized = intervals.map(({ startTime, endTime }) => ({
    start: startTime,
    end: endTime
  })).sort((left, right) => left.start.localeCompare(right.start));
  return normalized.every((interval, index) =>
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.start) &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.end) &&
    interval.end > interval.start &&
    (index === 0 || interval.start >= normalized[index - 1].end)
  );
};

function availabilityFor(entry, employeeId, day) {
  return (entry || []).find((item) =>
    entityId(item.employeeId ?? item.employee) === employeeId &&
    String(item.dateKey ?? item.date ?? '').slice(0, 10) === day
  );
}

export default function WeeklyRotaPlanner() {
  const [weekStart, setWeekStart] = useState(() => sundayOf(todayUKDateKey(new Date())));
  const [dashboard, setDashboard] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [staffingTargets, setStaffingTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [validation, setValidation] = useState(null);
  const [generationMethod, setGenerationMethod] = useState('MANUAL');
  const [instructionText, setInstructionText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState('en-GB');
  const recognitionRef = useRef(null);
  const [availabilityForm, setAvailabilityForm] = useState({
    employeeId: '', dateKey: '', status: 'UNKNOWN', intervals: [{ startTime: '09:00', endTime: '17:00' }], confirmed: false, reason: ''
  });
  const [bulkSelected, setBulkSelected] = useState([]);
  const [bulkDates, setBulkDates] = useState([weekStart]);
  const [bulkForm, setBulkForm] = useState({ status: 'UNKNOWN', intervals: [{ startTime: '09:00', endTime: '17:00' }], confirmed: false, reason: '' });
  const [assignmentForm, setAssignmentForm] = useState({ employeeId: '', shopId: '', dateKey: '', startTime: '09:00', endTime: '17:00' });
  const [targetForm, setTargetForm] = useState({ dateKey: weekStart, shopId: '', targetWorkers: '1' });
  const [editingKey, setEditingKey] = useState(null);
  const [exportEmployeeId, setExportEmployeeId] = useState('');
  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const employees = dashboard?.employees || [];
  const shops = dashboard?.shops || [];
  const rota = dashboard?.rota || null;
  const rotaStatus = rota?.status || rota?.state || 'DRAFT';
  const lockedCount = assignments.filter((item) => item.locked).length;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const [dashboardResponse, availabilityResponse] = await Promise.all([
        axios.get(`${API}/dashboard`, { params: { weekStart } }),
        axios.get(`${API}/availability`, { params: { weekStart } })
      ]);
      const next = dashboardResponse.data || {};
      setDashboard(next);
      setAssignments(getAssignments(next.rota));
      setStaffingTargets(next.rota?.staffingTargets || []);
      const rows = unwrapList(availabilityResponse.data, 'availability');
      setAvailability(rows);
      if (!availabilityForm.employeeId && next.employees?.length) {
        setAvailabilityForm((previous) => ({ ...previous, employeeId: idOf(next.employees[0]), dateKey: weekStart }));
      }
      setAssignmentForm((previous) => ({
        ...previous,
        employeeId: previous.employeeId || idOf(next.employees?.[0]),
        shopId: previous.shopId || idOf(next.shops?.[0]),
        dateKey: previous.dateKey || weekStart
      }));
      setTargetForm((previous) => ({
        ...previous,
        shopId: previous.shopId || idOf(next.shops?.[0]),
        dateKey: weekStart
      }));
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to load this rota week.'));
      setDashboard(null);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart, availabilityForm.employeeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const record = availabilityFor(availability, availabilityForm.employeeId, availabilityForm.dateKey);
    if (!record) {
      setAvailabilityForm((form) => ({ ...form, status: 'UNKNOWN', confirmed: false, reason: '' }));
      return;
    }
    setAvailabilityForm((form) => ({
      ...form,
      status: record.status || 'UNKNOWN',
      intervals: record.intervals?.length
        ? record.intervals.map((interval) => ({ startTime: interval.startTime, endTime: interval.endTime }))
        : [{ startTime: '09:00', endTime: '17:00' }],
      confirmed: Boolean(record.confirmed),
      reason: record.reason || ''
    }));
  }, [availability, availabilityForm.employeeId, availabilityForm.dateKey]);

  useEffect(() => {
    setAvailabilityForm((form) => ({ ...form, dateKey: weekStart }));
    setBulkDates([weekStart]);
    setAssignmentForm((form) => ({ ...form, dateKey: weekStart }));
    setTargetForm((form) => ({ ...form, dateKey: weekStart }));
  }, [weekStart]);

  useEffect(() => () => {
    recognitionRef.current?.stop?.();
  }, []);

  const changeWeek = (amount) => {
    const date = new Date(`${weekStart}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + amount * 7);
    setWeekStart(dateKey(date));
    setValidation(null);
  };

  const saveDraft = async (nextAssignments = assignments, method = generationMethod, instruction = instructionText) => {
    const revisingPublished = rotaStatus === 'PUBLISHED';
    if (revisingPublished && !window.confirm(
      `This rota is already published. Save these changes as an unpublished revision for the week of ${showDate(weekStart)}? The current published version will remain in history.`
    )) return false;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await axios.put(`${API}/week/${weekStart}/draft`, {
        assignments: nextAssignments.map((item) => ({
          employeeId: entityId(item.employeeId ?? item.employee),
          shopId: entityId(item.shopId ?? item.shop),
          dateKey: String(item.dateKey ?? item.date ?? '').slice(0, 10),
          startTime: item.startTime,
          endTime: item.endTime,
          ...(item.locked ? { locked: true } : {})
        })),
        staffingTargets: staffingTargets.map((target) => ({
          shopId: entityId(target.shopId ?? target.shop),
          dateKey: String(target.dateKey ?? target.date ?? '').slice(0, 10),
          targetWorkers: Number(target.targetWorkers)
        })),
        generationMethod: method,
        ...(revisingPublished ? { revisePublished: true } : {}),
        ...(instruction.trim() ? { instructionText: instruction.trim() } : {})
      });
      const saved = response.data || {};
      if (saved.rota) {
        setDashboard((current) => ({ ...current, rota: saved.rota }));
        setAssignments(getAssignments(saved.rota));
        setStaffingTargets(saved.rota.staffingTargets || []);
      }
      if (saved.validation) setValidation(saved.validation);
      setNotice('Draft saved. It is not published.');
      return true;
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to save rota draft.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setAvailabilityStatus = (status) => setAvailabilityForm((form) => ({
    ...form,
    status,
    intervals: status === 'AVAILABLE' && !form.intervals.length
      ? [{ startTime: '09:00', endTime: '17:00' }]
      : form.intervals,
    confirmed: status === 'UNKNOWN' ? false : form.confirmed
  }));

  const availabilityPayload = (form, employeeId, day) => ({
    employeeId,
    dateKey: day,
    status: form.status,
    intervals: form.status === 'AVAILABLE'
      ? form.intervals
      : [],
    confirmed: form.status === 'UNKNOWN' ? false : Boolean(form.confirmed),
    ...(form.reason.trim() ? { reason: form.reason.trim() } : {})
  });

  const saveAvailability = async (event) => {
    event.preventDefault();
    if (!availabilityForm.employeeId || !availabilityForm.dateKey) {
      setError('Choose an employee and date before saving availability.');
      return;
    }
    if (availabilityForm.status === 'AVAILABLE' && !validIntervals(availabilityForm.intervals)) {
      setError('Availability windows must have valid times and must not overlap.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await axios.put(`${API}/availability`, availabilityPayload(
        availabilityForm, availabilityForm.employeeId, availabilityForm.dateKey
      ));
      setNotice('Availability saved.');
      await refresh();
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to save availability.'));
    } finally {
      setSaving(false);
    }
  };

  const saveBulkAvailability = async (event) => {
    event.preventDefault();
    if (!bulkSelected.length || !bulkDates.length) {
      setError('Select one or more employees and days for bulk availability.');
      return;
    }
    if (bulkForm.status === 'AVAILABLE' && !validIntervals(bulkForm.intervals)) {
      setError('Availability windows must have valid times and must not overlap.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await axios.put(`${API}/availability/bulk`, {
        entries: bulkSelected.flatMap((employeeId) =>
          bulkDates.map((day) => availabilityPayload(bulkForm, employeeId, day))
        )
      });
      setNotice(`Availability updated for ${bulkSelected.length} employee${bulkSelected.length === 1 ? '' : 's'} across ${bulkDates.length} day${bulkDates.length === 1 ? '' : 's'}.`);
      await refresh();
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to update bulk availability.'));
    } finally {
      setSaving(false);
    }
  };

  const addAssignment = (event) => {
    event.preventDefault();
    if (!assignmentForm.employeeId || !assignmentForm.shopId || !assignmentForm.dateKey) {
      setError('Choose an employee, shop and date before adding an assignment.');
      return;
    }
    if (assignmentForm.startTime >= assignmentForm.endTime) {
      setError('Shift end time must be after its start time.');
      return;
    }
    const eligibilityIssue = employeeAssignmentStatus(assignmentForm.employeeId);
    if (eligibilityIssue) {
      const employee = employees.find((record) => idOf(record) === assignmentForm.employeeId);
      setError(`${employee ? nameOf(employee) : 'This employee'} cannot be assigned: ${eligibilityIssue}.`);
      return;
    }
    if (editingKey !== null) {
      setAssignments((items) => items.map((item, index) =>
        assignmentKey(item, index) === editingKey
          ? { ...item, ...assignmentForm }
          : item
      ));
      setEditingKey(null);
    } else {
      setAssignments((items) => [...items, { ...assignmentForm, _editKey: `local-${Date.now()}` }]);
    }
    setGenerationMethod('MANUAL');
    setValidation(null);
    setError('');
    setAssignmentForm((form) => ({ ...form, dateKey: weekStart }));
  };

  const editAssignment = (item, index) => {
    const key = assignmentKey(item, index);
    setEditingKey(key);
    setAssignmentForm({
      employeeId: entityId(item.employeeId ?? item.employee),
      shopId: entityId(item.shopId ?? item.shop),
      dateKey: String(item.dateKey ?? item.date ?? weekStart).slice(0, 10),
      startTime: item.startTime || '09:00',
      endTime: item.endTime || '17:00'
    });
  };

  const removeAssignment = (item, index) => {
    if (item.locked) return;
    const key = assignmentKey(item, index);
    setAssignments((items) => items.filter((candidate, candidateIndex) =>
      assignmentKey(candidate, candidateIndex) !== key
    ));
    if (editingKey === key) setEditingKey(null);
    setValidation(null);
  };

  const runValidation = async () => {
    if (!await saveDraft()) return;
    setValidating(true);
    setError('');
    setNotice('');
    try {
      const response = await axios.post(`${API}/week/${weekStart}/validate`);
      setValidation(response.data?.validation ?? response.data);
      setNotice(response.data?.validation?.valid === false ? 'Validation found issues to review.' : 'Validation complete.');
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to validate the rota.'));
    } finally {
      setValidating(false);
    }
  };

  const publish = async () => {
    const changesSinceSaved = assignmentChangeCount(getAssignments(rota), assignments);
    if (!await saveDraft()) return;
    setPublishing(true);
    setError('');
    setNotice('');
    try {
      const validationResponse = await axios.post(`${API}/week/${weekStart}/validate`);
      const currentValidation = validationResponse.data?.validation || validationResponse.data || {};
      setValidation(currentValidation);
      if (currentValidation.valid === false || currentValidation.errors?.length) {
        setError('Resolve all hard validation errors before publishing this rota.');
        return;
      }
      const targetShortfalls = staffingTargets.reduce((total, target) => {
        const assigned = assignments.filter((item) =>
          entityId(item.shopId ?? item.shop) === entityId(target.shopId ?? target.shop) &&
          String(item.dateKey ?? item.date ?? '').slice(0, 10) === target.dateKey
        ).length;
        return total + Math.max(0, Number(target.targetWorkers) - assigned);
      }, 0);
      const scheduledEmployees = new Set(assignments.map((item) => entityId(item.employeeId ?? item.employee))).size;
      const summary = [
        `Employees scheduled: ${scheduledEmployees}`,
        `Assignments: ${assignments.length}`,
        `Unfilled target shifts: ${targetShortfalls}`,
        `Availability/coverage warnings: ${currentValidation.warnings?.length || 0}`,
        `Hard validation errors: 0`,
        `Changes since last saved draft: ${changesSinceSaved}`,
        '',
        `Publish the rota for the week of ${showDate(weekStart)}?`
      ].join('\n');
      if (!window.confirm(summary)) return;
      const response = await axios.post(`${API}/week/${weekStart}/publish`);
      if (response.data?.rota) setDashboard((current) => ({ ...current, rota: response.data.rota }));
      setNotice('Rota published successfully.');
      await refresh();
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to publish this rota.'));
    } finally {
      setPublishing(false);
    }
  };

  const generateWithAi = async (method) => {
    if (!instructionText.trim()) {
      setError('Enter or dictate rota instructions before generating a draft.');
      return;
    }
    const revisingPublished = rotaStatus === 'PUBLISHED';
    if (revisingPublished && !window.confirm(
      `This rota is already published. Generate an unpublished revision? The current published version will remain in history.`
    )) return;
    setAiBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await axios.post(`${API}/week/${weekStart}/ai`, {
        text: instructionText.trim(),
        method,
        ...(revisingPublished ? { revisePublished: true } : {})
      });
      if (response.data?.rota) {
        setDashboard((current) => ({ ...current, rota: response.data.rota }));
        setAssignments(getAssignments(response.data.rota));
        setStaffingTargets(response.data.rota.staffingTargets || []);
      } else if (Array.isArray(response.data?.assignments)) {
        setAssignments(response.data.assignments);
      }
      if (response.data?.validation) setValidation(response.data.validation);
      setGenerationMethod(method);
      setNotice('AI draft generated for review. It has not been published.');
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to generate a rota draft.'));
    } finally {
      setAiBusy(false);
    }
  };

  const startVoiceInput = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice dictation is not supported in this browser. You can enter instructions in the text box instead.');
      document.getElementById('rota-ai-instructions')?.focus();
      return;
    }
    setError('');
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = voiceLanguage;
      recognition.interimResults = true;
      recognition.continuous = false;
      setVoiceBusy(true);
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results).map((result) => result[0]?.transcript || '').join('');
        setInstructionText(transcript);
      };
      recognition.onerror = (event) => {
        setError(event.error === 'not-allowed'
          ? 'Microphone permission was denied. Allow microphone access or type the instructions instead.'
          : `Voice dictation could not complete (${event.error || 'recognition error'}). You can type the instructions instead.`);
        setVoiceBusy(false);
      };
      recognition.onend = () => setVoiceBusy(false);
      recognition.start();
    } catch (voiceError) {
      setVoiceBusy(false);
      setError(voiceError?.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow microphone access or type the instructions instead.'
        : 'Could not start voice dictation. You can type the instructions instead.');
    }
  };

  const addStaffingTarget = (event) => {
    event.preventDefault();
    if (!targetForm.shopId || !targetForm.dateKey || !Number.isInteger(Number(targetForm.targetWorkers)) || Number(targetForm.targetWorkers) < 0) {
      setError('Choose a shop, date and a whole-number staffing target of zero or more.');
      return;
    }
    const nextTarget = {
      shopId: targetForm.shopId,
      dateKey: targetForm.dateKey,
      targetWorkers: Number(targetForm.targetWorkers)
    };
    setStaffingTargets((current) => [
      ...current.filter((target) => !(entityId(target.shopId ?? target.shop) === nextTarget.shopId && target.dateKey === nextTarget.dateKey)),
      nextTarget
    ]);
    setValidation(null);
    setError('');
  };

  const toggleAssignmentLock = async (item, index) => {
    const key = assignmentKey(item, index);
    const locked = !item.locked;
    const revisingPublished = rotaStatus === 'PUBLISHED';
    if (revisingPublished && !window.confirm(
      `This rota is already published. Change this assignment lock as an unpublished revision? The current published version will remain in history.`
    )) return;
    if (!idOf(item)) {
      setAssignments((current) => current.map((candidate, candidateIndex) =>
        assignmentKey(candidate, candidateIndex) === key ? { ...candidate, locked } : candidate
      ));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await axios.patch(`${API}/week/${weekStart}/assignment/${idOf(item)}/lock`, {
        locked,
        ...(revisingPublished ? { revisePublished: true } : {})
      });
      if (response.data?.rota) {
        setDashboard((current) => ({ ...current, rota: response.data.rota }));
        setAssignments(getAssignments(response.data.rota));
      }
      setNotice(locked ? 'Assignment locked.' : 'Assignment unlocked.');
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to change assignment lock.'));
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoaded(true);
    try {
      const response = await axios.get(`${API}/history`, { params: { limit: 50 } });
      setHistory(unwrapList(response.data, 'rotas'));
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to load rota history.'));
    }
  };

  const downloadExport = async (path, filename) => {
    setError('');
    try {
      const response = await axios.get(`${API}${path}`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to download export.'));
    }
  };

  const serverValidation = validation || {};
  const hardErrors = serverValidation.errors || serverValidation.hardErrors || [];
  const warnings = serverValidation.warnings || [];
  const hasBlockingIssues = hardErrors.length > 0 || validation?.valid === false;
  const totalHours = assignments.reduce((total, item) => {
    if (!item.startTime || !item.endTime) return total;
    const [startHour, startMinute] = item.startTime.split(':').map(Number);
    const [endHour, endMinute] = item.endTime.split(':').map(Number);
    return total + Math.max(0, ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60);
  }, 0);
  const dayAssignments = (day) => assignments.filter((item) => String(item.dateKey ?? item.date ?? '').slice(0, 10) === day);
  const availableEmployeeCount = new Set(availability
    .filter((item) => item.status === 'AVAILABLE' && item.confirmed)
    .map((item) => entityId(item.employeeId ?? item.employee))
  ).size;
  const confirmedAvailabilityCount = availability.filter((item) => item.confirmed && item.status !== 'UNKNOWN').length;
  const unconfirmedAvailabilityCount = Math.max(0, employees.length * 7 - confirmedAvailabilityCount);
  const unfilledTargetCount = staffingTargets.reduce((total, target) => {
    const assigned = assignments.filter((item) =>
      entityId(item.shopId ?? item.shop) === entityId(target.shopId ?? target.shop) &&
      String(item.dateKey ?? item.date ?? '').slice(0, 10) === target.dateKey
    ).length;
    return total + Math.max(0, Number(target.targetWorkers) - assigned);
  }, 0);
  const employeeAssignmentStatus = (employeeId) => {
    const record = availabilityFor(availability, employeeId, assignmentForm.dateKey);
    if (!record || !record.confirmed || record.status !== 'AVAILABLE') return 'Availability not confirmed';
    const shiftStart = assignmentForm.startTime;
    const shiftEnd = assignmentForm.endTime;
    if (record.intervals?.length && !record.intervals.some((interval) =>
      shiftStart >= interval.startTime && shiftEnd <= interval.endTime
    )) return 'Outside confirmed availability';
    const existing = assignments.find((item, index) =>
      entityId(item.employeeId ?? item.employee) === employeeId &&
      String(item.dateKey ?? item.date ?? '').slice(0, 10) === assignmentForm.dateKey &&
      assignmentKey(item, index) !== editingKey
    );
    if (existing) {
      const existingShop = shops.find((shop) => idOf(shop) === entityId(existing.shopId ?? existing.shop));
      return `Already assigned to ${existingShop?.name || 'another shop'}`;
    }
    return '';
  };
  const selectedShopHours = (() => {
    if (!assignmentForm.shopId || !assignmentForm.dateKey) return null;
    const dayOfWeek = new Date(`${assignmentForm.dateKey}T00:00:00.000Z`).getUTCDay();
    const schedules = dashboard?.schedules || [];
    const schedule = schedules.find((item) =>
      Number(item.dayOfWeek) === dayOfWeek && entityId(item.shop) === assignmentForm.shopId
    ) || schedules.find((item) => Number(item.dayOfWeek) === dayOfWeek && !item.shop);
    return schedule ? `${schedule.openingTime}–${schedule.closingTime}` : null;
  })();

  const archivePublishedRota = async () => {
    if (!window.confirm(`Archive the published rota for the week of ${showDate(weekStart)}? The published version will remain in history.`)) return;
    setSaving(true);
    setError('');
    try {
      const response = await axios.post(`${API}/week/${weekStart}/archive`);
      setDashboard((current) => ({ ...current, rota: response.data.rota }));
      setNotice('Published rota archived.');
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to archive this rota.'));
    } finally {
      setSaving(false);
    }
  };

  const discardDraft = async () => {
    if (!window.confirm(`Permanently discard the unpublished draft for ${showDate(weekStart)}?`)) return;
    setSaving(true);
    setError('');
    try {
      await axios.delete(`${API}/week/${weekStart}/draft`);
      setDashboard((current) => ({ ...current, rota: null }));
      setAssignments([]);
      setStaffingTargets([]);
      setValidation(null);
      setNotice('Draft discarded.');
    } catch (requestError) {
      setError(formatError(requestError, 'Unable to discard this draft.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !dashboard) {
    return <div className="page-container"><div className="card">Loading weekly rota…</div></div>;
  }

  return (
    <main className="page-container rota-planner">
      <div className="rota-header">
        <div>
          <h1>Weekly Rota Planner</h1>
          <p>Plan availability, build shifts and review the weekly rota before publication.</p>
        </div>
        <div className="rota-header-actions">
          <button className="btn btn-outline btn-sm" onClick={() => downloadExport(`/week/${weekStart}/export.xlsx`, `rota-${weekStart}.xlsx`)}>
            <Download size={15} /> Excel
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => downloadExport(`/week/${weekStart}/export.pdf`, `rota-${weekStart}.pdf`)}>
            <Download size={15} /> PDF
          </button>
          <select className="rota-export-employee" aria-label="Employee for export" value={exportEmployeeId} onChange={(event) => setExportEmployeeId(event.target.value)}>
            <option value="">Employee export…</option>
            {employees.map((employee) => <option key={idOf(employee)} value={idOf(employee)}>{nameOf(employee)}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" disabled={!exportEmployeeId} onClick={() => downloadExport(`/employee/${exportEmployeeId}/${weekStart}/export.xlsx`, `employee-rota-${weekStart}.xlsx`)} title="Download selected employee's Excel rota">
            Employee Excel
          </button>
          <button className="btn btn-outline btn-sm" disabled={!exportEmployeeId} onClick={() => downloadExport(`/employee/${exportEmployeeId}/${weekStart}/export.pdf`, `employee-rota-${weekStart}.pdf`)} title="Download selected employee's PDF rota">
            Employee PDF
          </button>
          <button className="btn btn-outline btn-sm" onClick={refresh} disabled={loading} aria-label="Refresh rota">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      <section className="rota-week-bar card">
        <button className="btn btn-outline btn-sm" onClick={() => changeWeek(-1)} aria-label="Previous week"><ChevronLeft size={16} /> Previous</button>
        <label className="rota-week-picker">
          Week starting Sunday
          <input
            type="date"
            value={weekStart}
            onChange={(event) => event.target.value && setWeekStart(sundayOf(event.target.value))}
            aria-label="Select week (Sunday through Saturday)"
          />
        </label>
        <div className="rota-week-range">{showDate(weekStart, { day: 'numeric', month: 'long', year: 'numeric' })} – {showDate(dateKey(days[6]), { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <button className="btn btn-outline btn-sm" onClick={() => changeWeek(1)} aria-label="Next week">Next <ChevronRight size={16} /></button>
      </section>
      {dashboard && <div className="rota-shop-list" aria-label="Active shops for weekly planning">
        <strong>{shops.length} active shops:</strong>
        {shops.map((shop) => <span key={idOf(shop)}>{shop.name}</span>)}
      </div>}

      {error && <div className="rota-message rota-error" role="alert"><AlertCircle size={17} />{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="rota-message rota-success" role="status"><Check size={17} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice">×</button></div>}

      {dashboard && (
        <>
          <section className="rota-stats">
            <div className="rota-stat"><span>Scheduled shifts</span><strong>{assignments.length}</strong><small>{lockedCount} locked</small></div>
            <div className="rota-stat"><span>Scheduled hours</span><strong>{totalHours.toFixed(1)}h</strong><small>From current draft</small></div>
            <div className="rota-stat"><span>Active workers</span><strong>{employees.length}</strong><small>Eligible employee records</small></div>
            <div className="rota-stat"><span>Available workers</span><strong>{availableEmployeeCount}</strong><small>Confirmed available this week</small></div>
            <div className="rota-stat"><span>Unfilled target shifts</span><strong>{unfilledTargetCount}</strong><small>Based on shop/day targets</small></div>
            <div className="rota-stat"><span>Unconfirmed availability</span><strong>{unconfirmedAvailabilityCount}</strong><small>Worker-days without confirmation</small></div>
            <div className="rota-stat"><span>Rota status</span><strong className={`rota-status status-${String(rotaStatus).toLowerCase()}`}>{rotaStatus}</strong><small>{rota?.publishedAt ? `Published ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Europe/London' }).format(new Date(rota.publishedAt))}` : 'Not published'}</small></div>
          </section>

          <section className="card rota-section">
            <div className="rota-section-title">
              <div><h2><Users size={18} /> Availability</h2><p>Review staff availability for this week. Unknown availability remains unconfirmed.</p></div>
            </div>
            <div className="rota-availability-grid">
              <form className="rota-form-panel" onSubmit={saveAvailability}>
                <h3>Edit one employee</h3>
                <div className="rota-form-grid">
                  <label>Employee<select value={availabilityForm.employeeId} onChange={(e) => setAvailabilityForm({ ...availabilityForm, employeeId: e.target.value })} required>
                    <option value="">Select employee</option>{employees.map((employee) => <option key={idOf(employee)} value={idOf(employee)}>{nameOf(employee)}</option>)}
                  </select></label>
                  <label>Date<select value={availabilityForm.dateKey} onChange={(e) => setAvailabilityForm({ ...availabilityForm, dateKey: e.target.value })}>
                    {days.map((day) => <option key={dateKey(day)} value={dateKey(day)}>{WEEKDAY[weekdayIndex(day)]} · {showDate(dateKey(day))}</option>)}
                  </select></label>
                  <label>Status<select value={availabilityForm.status} onChange={(e) => setAvailabilityStatus(e.target.value)}>
                    <option value="UNKNOWN">Unconfirmed</option><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option>
                  </select></label>
                  {availabilityForm.status === 'AVAILABLE' && <>
                    {availabilityForm.intervals.map((interval, index) => <React.Fragment key={index}>
                      <label>From<input type="time" value={interval.startTime} onChange={(e) => setAvailabilityForm((form) => ({ ...form, intervals: form.intervals.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: e.target.value } : item) }))} /></label>
                      <label>Until<input type="time" value={interval.endTime} onChange={(e) => setAvailabilityForm((form) => ({ ...form, intervals: form.intervals.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: e.target.value } : item) }))} /></label>
                      {availabilityForm.intervals.length > 1 && <button type="button" className="btn btn-outline btn-sm" onClick={() => setAvailabilityForm((form) => ({ ...form, intervals: form.intervals.filter((_, itemIndex) => itemIndex !== index) }))}>Remove window</button>}
                    </React.Fragment>)}
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setAvailabilityForm((form) => ({ ...form, intervals: [...form.intervals, { startTime: '13:00', endTime: '17:00' }] }))}>Add availability window</button>
                    <button type="button" className="btn btn-outline btn-sm rota-all-day" onClick={() => setAvailabilityForm({ ...availabilityForm, intervals: [{ startTime: '00:00', endTime: '23:59' }] })}>Set all day</button>
                  </>}
                  <label className="rota-reason">Reason (optional)<input value={availabilityForm.reason} onChange={(e) => setAvailabilityForm({ ...availabilityForm, reason: e.target.value })} placeholder="Add a note" /></label>
                </div>
                <label className="rota-check"><input type="checkbox" checked={availabilityForm.confirmed} disabled={availabilityForm.status === 'UNKNOWN'} onChange={(e) => setAvailabilityForm({ ...availabilityForm, confirmed: e.target.checked })} /> Employee has confirmed this availability</label>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !employees.length}><Save size={15} /> Save availability</button>
                {availabilityFor(availability, availabilityForm.employeeId, availabilityForm.dateKey) && <span className="rota-current-record">Current record: {availabilityFor(availability, availabilityForm.employeeId, availabilityForm.dateKey).status || 'UNKNOWN'}</span>}
              </form>

              <form className="rota-form-panel" onSubmit={saveBulkAvailability}>
                <h3>Bulk update employees</h3>
                <p className="rota-hint">Apply the same availability to selected employees for one date.</p>
                <div className="rota-form-grid">
                  <div className="rota-bulk-days">
                    <span className="rota-field-title">Days to update</span>
                    <div>{days.map((day) => {
                      const key = dateKey(day);
                      return <label key={key}><input type="checkbox" checked={bulkDates.includes(key)} onChange={(event) => setBulkDates((current) => event.target.checked ? [...current, key].sort() : current.filter((date) => date !== key))} />{WEEKDAY[weekdayIndex(day)]}</label>;
                    })}</div>
                  </div>
                  <label>Status<select value={bulkForm.status} onChange={(e) => setBulkForm({ ...bulkForm, status: e.target.value, confirmed: e.target.value === 'UNKNOWN' ? false : bulkForm.confirmed })}>
                    <option value="UNKNOWN">Unconfirmed</option><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option>
                  </select></label>
                  {bulkForm.status === 'AVAILABLE' && <>
                    {bulkForm.intervals.map((interval, index) => <React.Fragment key={index}>
                      <label>From<input type="time" value={interval.startTime} onChange={(e) => setBulkForm((form) => ({ ...form, intervals: form.intervals.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: e.target.value } : item) }))} /></label>
                      <label>Until<input type="time" value={interval.endTime} onChange={(e) => setBulkForm((form) => ({ ...form, intervals: form.intervals.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: e.target.value } : item) }))} /></label>
                    </React.Fragment>)}
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setBulkForm((form) => ({ ...form, intervals: [...form.intervals, { startTime: '13:00', endTime: '17:00' }] }))}>Add availability window</button>
                  </>}
                </div>
                {bulkForm.status === 'AVAILABLE' && <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 9 }} onClick={() => setBulkForm({ ...bulkForm, intervals: [{ startTime: '00:00', endTime: '23:59' }] })}>Set all day</button>}
                <div className="rota-select-actions">
                  <span>Select employees ({bulkSelected.length})</span>
                  <button type="button" onClick={() => setBulkSelected(employees.map(idOf))}>Select all</button>
                  <button type="button" onClick={() => setBulkSelected([])}>Clear</button>
                </div>
                <div className="rota-employee-checks">{employees.map((employee) => (
                  <label key={idOf(employee)}><input type="checkbox" checked={bulkSelected.includes(idOf(employee))} onChange={(e) => setBulkSelected((current) => e.target.checked ? [...current, idOf(employee)] : current.filter((id) => id !== idOf(employee)))} />{nameOf(employee)}</label>
                ))}</div>
                <label className="rota-check"><input type="checkbox" checked={bulkForm.confirmed} disabled={bulkForm.status === 'UNKNOWN'} onChange={(e) => setBulkForm({ ...bulkForm, confirmed: e.target.checked })} /> Mark as confirmed</label>
                <button type="submit" className="btn btn-outline btn-sm" disabled={saving || !employees.length}><Users size={15} /> Apply to selected</button>
              </form>
            </div>
            <div className="table-responsive rota-availability-table">
              <table className="custom-table">
                <thead><tr><th>Employee</th>{days.map((day) => <th key={dateKey(day)}>{WEEKDAY[weekdayIndex(day)]}<small>{showDate(dateKey(day))}</small></th>)}</tr></thead>
                <tbody>{employees.map((employee) => <tr key={idOf(employee)}>
                  <td>{nameOf(employee)}</td>
                  {days.map((day) => {
                    const record = availabilityFor(availability, idOf(employee), dateKey(day));
                    const status = record?.status || 'UNKNOWN';
                    return <td key={dateKey(day)}><span className={`rota-availability-pill avail-${status.toLowerCase()}`}>{status === 'UNKNOWN' ? 'Unconfirmed' : status === 'AVAILABLE' ? 'Available' : 'Unavailable'}{record?.confirmed && status !== 'UNKNOWN' ? ' · Confirmed' : ''}</span>{record?.intervals?.[0] && <small className="rota-interval">{record.intervals.map((interval) => `${interval.startTime}–${interval.endTime}`).join(', ')}</small>}</td>;
                  })}
                </tr>)}</tbody>
              </table>
              {!employees.length && <div className="rota-empty">No employee records were returned for this week.</div>}
            </div>
          </section>

          <section className="card rota-section">
            <div className="rota-section-title"><div><h2><Sparkles size={18} /> Build and review draft</h2><p>Manual assignments and AI suggestions stay as drafts until explicitly published.</p></div></div>
            {rotaStatus === 'PUBLISHED' && <div className="rota-message rota-warning" role="status">This week has a published version. Saving or generating changes requires confirmation and creates an unpublished revision; the existing published version is preserved in history.</div>}
            <div className="rota-ai-panel">
              <label htmlFor="rota-ai-instructions">AI rota instructions</label>
              <textarea id="rota-ai-instructions" value={instructionText} onChange={(e) => setInstructionText(e.target.value)} placeholder="Describe staffing requirements, preferred shifts, or constraints. Review generated assignments before saving or publishing." rows={3} />
              <div className="rota-ai-actions">
                <label className="rota-voice-language">Transcription language (browser support varies)
                  <select value={voiceLanguage} onChange={(event) => setVoiceLanguage(event.target.value)} disabled={voiceBusy}>
                    <option value="en-GB">English (UK)</option>
                    <option value="ur-PK">Urdu</option>
                  </select>
                </label>
                <button type="button" className="btn btn-outline btn-sm" onClick={startVoiceInput} disabled={voiceBusy || aiBusy}><Mic size={15} />{voiceBusy ? 'Listening…' : 'Dictate'}</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => generateWithAi('AI_TEXT')} disabled={aiBusy || voiceBusy}><Sparkles size={15} />{aiBusy ? 'Generating…' : 'Generate from text'}</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => generateWithAi('AI_VOICE')} disabled={aiBusy || voiceBusy || !instructionText.trim()}><Mic size={15} />Generate voice transcript</button>
                {voiceBusy && <button type="button" className="btn btn-outline btn-sm" onClick={() => recognitionRef.current?.stop?.()}>Stop recording</button>}
                <span>Voice recognition depends on browser support. Transcript can be edited before generation.</span>
              </div>
            </div>

            <form className="rota-form-panel rota-target-form" onSubmit={addStaffingTarget}>
              <h3>Shop staffing targets</h3>
              <p className="rota-hint">Set the target worker count for a shop and day; shortages appear in validation warnings.</p>
              <div className="rota-manual-fields">
                <label>Date<select value={targetForm.dateKey} onChange={(e) => setTargetForm({ ...targetForm, dateKey: e.target.value })}>{days.map((day) => <option key={dateKey(day)} value={dateKey(day)}>{WEEKDAY[weekdayIndex(day)]} · {showDate(dateKey(day))}</option>)}</select></label>
                <label>Shop<select value={targetForm.shopId} onChange={(e) => setTargetForm({ ...targetForm, shopId: e.target.value })} required><option value="">Select shop</option>{shops.map((shop) => <option key={idOf(shop)} value={idOf(shop)}>{shop.name}</option>)}</select></label>
                <label>Target workers<input type="number" min="0" step="1" value={targetForm.targetWorkers} onChange={(e) => setTargetForm({ ...targetForm, targetWorkers: e.target.value })} required /></label>
                <button type="submit" className="btn btn-outline btn-sm"><Plus size={15} /> Set target</button>
              </div>
              {!!staffingTargets.length && <ul className="rota-target-list">{staffingTargets.map((target) => {
                const targetShop = shops.find((shop) => idOf(shop) === entityId(target.shopId ?? target.shop));
                return <li key={`${target.dateKey}:${entityId(target.shopId ?? target.shop)}`}>
                  {showDate(target.dateKey, { day: 'numeric', month: 'short' })} · {targetShop?.name || 'Shop'}: {target.targetWorkers} worker{Number(target.targetWorkers) === 1 ? '' : 's'}
                  <button type="button" onClick={() => setStaffingTargets((current) => current.filter((item) => !(item.dateKey === target.dateKey && entityId(item.shopId ?? item.shop) === entityId(target.shopId ?? target.shop))))} aria-label="Remove staffing target"><Trash2 size={14} /></button>
                </li>;
              })}</ul>}
            </form>

            <form className="rota-manual-form" onSubmit={addAssignment}>
              <h3>{editingKey !== null ? 'Edit assignment' : 'Add manual assignment'}</h3>
              <div className="rota-manual-fields">
                <label>Employee<select value={assignmentForm.employeeId} onChange={(e) => setAssignmentForm({ ...assignmentForm, employeeId: e.target.value })} required><option value="">Select eligible employee</option>{employees.map((employee) => {
                  const employeeId = idOf(employee);
                  const reason = employeeAssignmentStatus(employeeId);
                  return <option key={employeeId} value={employeeId} disabled={Boolean(reason) && employeeId !== assignmentForm.employeeId}>{nameOf(employee)}{reason ? ` — ${reason}` : ''}</option>;
                })}</select></label>
                <label>Shop<select value={assignmentForm.shopId} onChange={(e) => setAssignmentForm({ ...assignmentForm, shopId: e.target.value })} required><option value="">Select shop</option>{shops.map((shop) => <option key={idOf(shop)} value={idOf(shop)}>{shop.name}</option>)}</select></label>
                <label>Date<select value={assignmentForm.dateKey} onChange={(e) => setAssignmentForm({ ...assignmentForm, dateKey: e.target.value })}>{days.map((day) => <option key={dateKey(day)} value={dateKey(day)}>{WEEKDAY[weekdayIndex(day)]} · {showDate(dateKey(day))}</option>)}</select></label>
                <label>From<input type="time" value={assignmentForm.startTime} onChange={(e) => setAssignmentForm({ ...assignmentForm, startTime: e.target.value })} required /></label>
                <label>Until<input type="time" value={assignmentForm.endTime} onChange={(e) => setAssignmentForm({ ...assignmentForm, endTime: e.target.value })} required /></label>
                <button type="submit" className="btn btn-outline btn-sm"><Plus size={15} />{editingKey !== null ? 'Update shift' : 'Add shift'}</button>
                {editingKey !== null && <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingKey(null)}>Cancel</button>}
              </div>
              <p className="rota-hint">Shop hours for this day: {selectedShopHours || 'No active schedule found'} · Only workers with confirmed availability can be assigned.</p>
            </form>

            <div className="table-responsive">
              <table className="custom-table rota-assignment-table">
                <thead><tr><th>Day</th><th>Employee</th><th>Shop</th><th>Shift</th><th>Hours</th><th>State</th><th>Actions</th></tr></thead>
                <tbody>{assignments.map((item, index) => {
                  const employeeId = entityId(item.employeeId ?? item.employee);
                  const shopId = entityId(item.shopId ?? item.shop);
                  const employee = employees.find((record) => idOf(record) === employeeId);
                  const shop = shops.find((record) => idOf(record) === shopId);
                  const date = String(item.dateKey ?? item.date ?? '').slice(0, 10);
                  const key = assignmentKey(item, index);
                  return <tr key={key}>
                    <td>{date ? `${WEEKDAY[weekdayIndex(new Date(`${date}T00:00:00.000Z`))]}, ${showDate(date)}` : '—'}</td>
                    <td>{employee ? nameOf(employee) : item.employee?.name || 'Unknown employee'}</td>
                    <td>{shop?.name || item.shop?.name || 'Unknown shop'}</td>
                    <td>{item.startTime || '—'}–{item.endTime || '—'}</td>
                    <td>{assignmentHours(item)}</td>
                    <td>{item.locked ? <span className="rota-lock">Locked</span> : 'Draft'}</td>
                    <td><div className="rota-row-actions"><button type="button" disabled={item.locked} onClick={() => editAssignment(item, index)} aria-label="Edit assignment">Edit</button><button type="button" disabled={item.locked} onClick={() => removeAssignment(item, index)} aria-label="Remove assignment"><Trash2 size={15} /></button><button type="button" disabled={saving} onClick={() => toggleAssignmentLock(item, index)} aria-label={item.locked ? 'Unlock assignment' : 'Lock assignment'}>{item.locked ? 'Unlock' : 'Lock'}</button></div></td>
                  </tr>;
                })}</tbody>
              </table>
              {!assignments.length && <div className="rota-empty">No shifts in this draft yet. Add a manual assignment or generate a draft.</div>}
            </div>
            <div className="rota-draft-actions">
              <span>{assignments.length} assignment{assignments.length === 1 ? '' : 's'} · {lockedCount} locked rows</span>
              <button className="btn btn-outline btn-sm" onClick={() => saveDraft()} disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save draft'}</button>
              <button className="btn btn-outline btn-sm" onClick={runValidation} disabled={validating}>{validating ? 'Validating…' : 'Validate draft'}</button>
              <button className="btn btn-primary btn-sm" onClick={publish} disabled={publishing || rotaStatus === 'PUBLISHED' || hasBlockingIssues}>{publishing ? 'Publishing…' : 'Publish rota'}</button>
              {rotaStatus === 'DRAFT' && rota && <button className="btn btn-outline btn-sm" onClick={discardDraft} disabled={saving}>Discard draft</button>}
              {rotaStatus === 'PUBLISHED' && <button className="btn btn-outline btn-sm" onClick={archivePublishedRota} disabled={saving}>Archive published rota</button>}
            </div>
            {validation && <div className={`rota-validation ${hardErrors.length || validation.valid === false ? 'has-errors' : 'is-valid'}`}>
              <strong>{hardErrors.length || validation.valid === false ? 'Review required' : 'Validation results'}</strong>
              {hardErrors.length > 0 && <ul>{hardErrors.map((issue, index) => <li key={index}>{typeof issue === 'string' ? issue : issue.message || JSON.stringify(issue)}</li>)}</ul>}
              {warnings.length > 0 && <div className="rota-warnings"><strong>Warnings</strong><ul>{warnings.map((issue, index) => <li key={index}>{typeof issue === 'string' ? issue : issue.message || JSON.stringify(issue)}</li>)}</ul></div>}
              {!hardErrors.length && !warnings.length && <p>{validation.message || (validation.valid === false ? 'The rota has blocking validation issues.' : 'No validation issues reported.')}</p>}
            </div>}
          </section>

          <section className="card rota-section">
            <div className="rota-section-title"><div><h2><CalendarDays size={18} /> Weekly timetable</h2><p>Shifts grouped by day for a clear publication review.</p></div></div>
            <div className="rota-timetable">
              {days.map((day) => {
                const dayKey = dateKey(day);
                const shifts = dayAssignments(dayKey);
                return <article className="rota-day-column" key={dayKey}>
                  <header><strong>{WEEKDAY[weekdayIndex(day)]}</strong><span>{showDate(dayKey)}</span><small>{shifts.length} shift{shifts.length === 1 ? '' : 's'}</small></header>
                  {shifts.length ? shifts.map((item, index) => {
                    const employee = employees.find((record) => idOf(record) === entityId(item.employeeId ?? item.employee));
                    const shop = shops.find((record) => idOf(record) === entityId(item.shopId ?? item.shop));
                    return <div className={`rota-shift-card ${item.locked ? 'is-locked' : ''}`} key={item._editKey || idOf(item) || index}>
                      <strong>{employee ? nameOf(employee) : item.employee?.name || 'Unknown employee'}</strong>
                      <span><Clock3 size={13} />{item.startTime}–{item.endTime}</span>
                      <small>{shop?.name || item.shop?.name || 'Unknown shop'}{item.locked ? ' · Locked' : ''}</small>
                    </div>;
                  }) : <div className="rota-day-empty">No shifts</div>}
                </article>;
              })}
            </div>
          </section>

          {exportEmployeeId && (() => {
            const selectedEmployee = employees.find((employee) => idOf(employee) === exportEmployeeId);
            const employeeAssignments = assignments.filter((item) =>
              entityId(item.employeeId ?? item.employee) === exportEmployeeId
            );
            return <section className="card rota-section">
              <div className="rota-section-title"><div><h2><Users size={18} /> {selectedEmployee ? nameOf(selectedEmployee) : 'Employee'} timetable</h2><p>Individual preview for this selected week.</p></div></div>
              <div className="rota-employee-timetable">
                {days.map((day) => {
                  const dayKey = dateKey(day);
                  const shift = employeeAssignments.find((item) => String(item.dateKey ?? item.date ?? '').slice(0, 10) === dayKey);
                  const shop = shift && shops.find((record) => idOf(record) === entityId(shift.shopId ?? shift.shop));
                  return <div key={dayKey}><strong>{WEEKDAY[weekdayIndex(day)]}</strong><span>{showDate(dayKey)}</span><p>{shift ? `${shop?.name || shift.shop?.name || 'Shop'} · ${shift.startTime}–${shift.endTime}` : 'Off'}</p></div>;
                })}
              </div>
            </section>;
          })()}

          <section className="card rota-section rota-history-section">
            <div className="rota-section-title"><div><h2><History size={18} /> Rota history</h2><p>Recent rota revisions and publication activity.</p></div>
              {!historyLoaded && <button className="btn btn-outline btn-sm" onClick={loadHistory}>Load history</button>}
            </div>
            {historyLoaded && <div className="table-responsive">
              <table className="custom-table"><thead><tr><th>Week</th><th>Status</th><th>Updated</th><th>Assignments</th></tr></thead>
                <tbody>{history.map((item, index) => {
                  const start = String(item.weekStart ?? item.startDate ?? '').slice(0, 10);
                  return                                     <tr key={idOf(item) || index}><td>{start ? showDate(start, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td><td>{item.status || '—'}</td><td>{item.updatedAt || item.publishedAt ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(item.updatedAt || item.publishedAt)) : '—'}</td><td>{item.publishedVersions?.at(-1)?.assignments?.length ?? item.assignments?.length ?? item.assignmentCount ?? '—'}</td></tr>;
                })}</tbody>
              </table>
              {!history.length && <div className="rota-empty">No rota history records returned.</div>}
            </div>}
          </section>
        </>
      )}
    </main>
  );
}
