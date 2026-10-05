const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
require('../utils/pdfkitFontPatch'); // Must be before PDFDocument — patches font resolution for Vercel
const PDFDocument = require('pdfkit');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const ShopSchedule = require('../models/ShopSchedule');
const WeeklyRota = require('../models/WeeklyRota');
const RotaAvailability = require('../models/RotaAvailability');
const RotaAssignmentClaim = require('../models/RotaAssignmentClaim');
const { logAction } = require('../utils/audit');
const {
  getWeek, dateInWeek, minutes, validateIntervals, validatePayload, isDateKey,
  findDuplicateEmployeeDates, getEmployeeDayAssignments, createAiRosterContext, resolveAiAssignments
} = require('../utils/rota');

class RotaError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function id(value) {
  return String(value?._id || value || '');
}

function plain(value) {
  return value && typeof value.toObject === 'function' ? value.toObject() : value;
}

function cleanRota(rota) {
  if (!rota) return null;
  return plain(rota);
}

function checkObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw new RotaError(400, `${label} must be a valid ID.`);
}

async function buildValidation(rota, source) {
  const errors = [];
  const warnings = [];
  const week = getWeek(rota.weekStart);
  const assignments = source.assignments || [];
  const targets = source.staffingTargets || [];

  if (!assignments.length) errors.push('Add at least one assignment before publishing this weekly rota.');
  assignments.forEach((assignment, index) => {
    if (!dateInWeek(assignment.dateKey, week.weekStart)) errors.push(`Assignment ${index + 1} is outside the rota week.`);
  });
  targets.forEach((target, index) => {
    if (!dateInWeek(target.dateKey, week.weekStart)) errors.push(`Staffing target ${index + 1} is outside the rota week.`);
  });

  const duplicateAssignments = findDuplicateEmployeeDates(assignments);

  const employeeIds = [...new Set(assignments.map(a => id(a.employeeId)))];
  const shopIds = [...new Set([...assignments.map(a => id(a.shopId)), ...targets.map(t => id(t.shopId))])];
  const [employees, shops, availability, schedules] = await Promise.all([
    employeeIds.length ? Employee.find({ _id: { $in: employeeIds } }).select('name employeeId employmentStatus') : [],
    shopIds.length ? Shop.find({ _id: { $in: shopIds } }).select('name code status isActive') : [],
    employeeIds.length ? RotaAvailability.find({ employeeId: { $in: employeeIds }, dateKey: { $gte: week.weekStart, $lte: week.weekEnd } }) : [],
    ShopSchedule.find({ $or: [{ shop: { $in: shopIds } }, { shop: null }] })
  ]);
  const employeeMap = new Map(employees.map(item => [id(item), item]));
  const shopMap = new Map(shops.map(item => [id(item), item]));
  const availabilityMap = new Map(availability.map(item => [`${id(item.employeeId)}:${item.dateKey}`, item]));
  const scheduleMap = new Map();
  for (const schedule of schedules) {
    const key = `${id(schedule.shop)}:${schedule.dayOfWeek}`;
    if (!scheduleMap.has(key) || schedule.shop) scheduleMap.set(key, schedule);
  }
  for (const duplicate of duplicateAssignments) {
    const employeeName = employeeMap.get(duplicate.employeeId)?.name || 'This employee';
    const shopNames = duplicate.shopIds
      .map(shopId => shopMap.get(shopId)?.name || 'an unknown shop');
    errors.push(
      `${employeeName} has conflicting assignments on ${duplicate.dateKey}${shopNames.length ? ` at ${shopNames.join(' and ')}` : ''}. Keep only one working shop for that day.`
    );
  }

  for (const assignment of assignments) {
    const employee = employeeMap.get(id(assignment.employeeId));
    const shop = shopMap.get(id(assignment.shopId));
    const label = `${employee?.name || id(assignment.employeeId)} on ${assignment.dateKey}`;
    if (!employee) errors.push(`${label}: employee not found.`);
    else if (employee.employmentStatus !== 'Active') errors.push(`${label}: employee is not active.`);
    if (!shop) errors.push(`${label}: shop not found.`);
    else if (shop.status !== 'Active' || !shop.isActive) errors.push(`${label}: shop is not active.`);

    const availabilityRecord = availabilityMap.get(`${id(assignment.employeeId)}:${assignment.dateKey}`);
    if (availabilityRecord && availabilityRecord.status === 'UNAVAILABLE') {
      warnings.push(`${label}: employee is marked unavailable.`);
    } else if (availabilityRecord && availabilityRecord.intervals.length) {
      const start = minutes(assignment.startTime);
      const end = minutes(assignment.endTime);
      const covered = availabilityRecord.intervals.some(interval =>
        start >= minutes(interval.startTime) && end <= minutes(interval.endTime));
      if (!covered) warnings.push(`${label}: shift is outside employee's preferred availability window.`);
    }

    if (shop && dateInWeek(assignment.dateKey, week.weekStart)) {
      const day = new Date(`${assignment.dateKey}T00:00:00.000Z`).getUTCDay();
      const schedule = scheduleMap.get(`${id(shop._id)}:${day}`) || scheduleMap.get(`:${day}`);
      if (!schedule || !schedule.isActive) {
        warnings.push(`${label}: no standard shop schedule on file.`);
      } else {
        const opening = minutes(schedule.openingTime);
        const closing = minutes(schedule.closingTime);
        if (opening !== null && closing !== null && (minutes(assignment.startTime) < opening || minutes(assignment.endTime) > closing)) {
          warnings.push(`${label}: shift is outside standard shop hours (${schedule.openingTime}-${schedule.closingTime}).`);
        }
      }
    }
  }

  for (const target of targets) {
    const shop = shopMap.get(id(target.shopId));
    if (!shop) errors.push(`Staffing target for ${target.dateKey}: shop not found.`);
    else if (shop.status !== 'Active' || !shop.isActive) errors.push(`Staffing target for ${target.dateKey}: shop is not active.`);
    if (dateInWeek(target.dateKey, week.weekStart)) {
      const count = assignments.filter(a => id(a.shopId) === id(target.shopId) && a.dateKey === target.dateKey).length;
      if (count < target.targetWorkers) warnings.push(`${target.dateKey}: ${shop?.name || 'Shop'} is below its target by ${target.targetWorkers - count} worker(s).`);
      if (count > target.targetWorkers) warnings.push(`${target.dateKey}: ${shop?.name || 'Shop'} is above its target by ${count - target.targetWorkers} worker(s).`);
    }
  }

  if (employeeIds.length) {
    const claims = await RotaAssignmentClaim.find({
      employeeId: { $in: employeeIds },
      dateKey: { $gte: week.weekStart, $lte: week.weekEnd },
      rotaId: { $ne: rota._id }
    }).select('employeeId dateKey');
    const claimSet = new Set(claims.map(claim => `${id(claim.employeeId)}:${claim.dateKey}`));
    for (const assignment of assignments) {
      if (claimSet.has(`${id(assignment.employeeId)}:${assignment.dateKey}`)) {
        errors.push(`${assignment.dateKey}: employee already has a published shift in another rota.`);
      }
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

async function getOrCreateRota(week) {
  await WeeklyRota.init();
  let rota = await WeeklyRota.findOne({ weekStart: week.weekStart });
  if (!rota) {
    try {
      rota = await WeeklyRota.create({ ...week });
    } catch (error) {
      if (error.code !== 11000) throw error;
      rota = await WeeklyRota.findOne({ weekStart: week.weekStart });
    }
  }
  return rota;
}

async function getWeekData(weekStart) {
  const week = getWeek(weekStart);
  const [rota, employees, shops, availability, schedules] = await Promise.all([
    WeeklyRota.findOne({ weekStart }).lean(),
    Employee.find({}).select('name employeeId employmentStatus assignedShop').sort({ name: 1 }).lean(),
    Shop.find({ status: 'Active', isActive: true }).select('name code').sort({ name: 1 }).lean(),
    RotaAvailability.find({ dateKey: { $gte: week.weekStart, $lte: week.weekEnd } }).sort({ dateKey: 1 }).lean(),
    ShopSchedule.find({ $or: [{ shop: { $in: await Shop.find({ status: 'Active', isActive: true }).distinct('_id') } }, { shop: null }] }).lean()
  ]);

  // ── Server-side cross-shop display pre-computation ──────────────────────
  // Builds displayText for every assignment so the frontend just reads it —
  // no complex client-side lookup that can break with browser caching.
  if (rota && rota.assignments && rota.assignments.length) {
    const shopById = {};
    shops.forEach(s => { shopById[String(s._id)] = s.name; });

    // Step 1: empDateMap[empId:dateKey] = shop ID where worker physically is
    const empDateMap = {};
    rota.assignments.forEach(a => {
      const eId = String(a.employeeId);
      const dk  = String(a.dateKey).slice(0, 10);
      const hId = id(a.homeShopId || a.shopId);
      const sId = id(a.shopId);
      const key = `${eId}:${dk}`;
      if (a.status === 'OFF') {
        if (!empDateMap[key]) empDateMap[key] = null; // null = absent
      } else {
        const physicalShopId = a.status === 'LOANED' || hId !== sId ? sId : hId;
        if (!empDateMap[key]) empDateMap[key] = physicalShopId; // first non-OFF wins
      }
    });

    // Step 2: enrich each assignment with displayText + displayStatus
    rota.assignments = rota.assignments.map(a => {
      const hId = id(a.homeShopId || a.shopId);
      const sId = id(a.shopId);
      let targetShopName = shopById[sId] || '';
      let displayText, displayStatus;
      if (a.status === 'OFF') {
        const workingShopId = empDateMap[`${id(a.employeeId)}:${String(a.dateKey).slice(0, 10)}`];
        if (workingShopId && workingShopId !== hId) {
          targetShopName = shopById[workingShopId] || '';
          displayText = targetShopName || 'Other Shop';
          displayStatus = 'LOANED';
        } else {
          displayText = 'OFF';
          displayStatus = 'OFF';
        }
      } else if (a.status === 'LOANED') {
        displayText = targetShopName || 'Transferred'; displayStatus = 'LOANED';
      } else if (a.status === 'CUSTOM') {
        displayText = a.note || 'Available'; displayStatus = 'CUSTOM';
      } else {
        displayText = 'Available'; displayStatus = 'AVAILABLE';
      }
      return { ...a, displayText, displayStatus, targetShopName };
    });

    // Step 3: crossShopMap[shopId:empId:dateKey] — what to show in a shop's cell
    // for a worker who is listed in that shop's roster but has no direct assignment there.
    const crossShopMap = {};
    const assignedKeys = new Set(
      rota.assignments.map(a =>
        `${String(a.homeShopId || a.shopId)}:${String(a.employeeId)}:${String(a.dateKey).slice(0,10)}`
      )
    );
    shops.forEach(shop => {
      const sId = String(shop._id);
      rota.assignments.forEach(a => {
        const hId = String(a.homeShopId || a.shopId);
        if (hId === sId) return; // this IS the home shop, skip
        const eId = String(a.employeeId);
        const dk  = String(a.dateKey).slice(0, 10);
        const crossKey = `${sId}:${eId}:${dk}`;
        // Only add if this shop has NO direct assignment for this worker on this day
        if (!assignedKeys.has(crossKey) && !crossShopMap[crossKey]) {
          const where = empDateMap[`${eId}:${dk}`];
          if (where === null || where === undefined) {
            crossShopMap[crossKey] = { displayText: 'OFF', displayStatus: 'OFF' };
          } else {
            crossShopMap[crossKey] = { displayText: shopById[where] || 'Other Shop', displayStatus: 'LOANED' };
          }
        }
      });
    });
    rota.crossShopMap = crossShopMap;
  }

  return { success: true, weekStart: week.weekStart, weekEnd: week.weekEnd, rota, employees, shops, availability, schedules };
}

async function persistDraft(req, res, input, generationMethod = input.generationMethod) {
  const week = getWeek(req.params.weekStart);
  const structuralError = validatePayload(input.assignments, input.staffingTargets, generationMethod);
  if (structuralError) throw new RotaError(400, structuralError);
  if (input.assignments.some(a => !dateInWeek(a.dateKey, week.weekStart)) ||
      (input.staffingTargets || []).some(t => !dateInWeek(t.dateKey, week.weekStart))) {
    throw new RotaError(400, 'All assignments and staffing targets must fall within the selected Monday-Sunday week.');
  }
  input.assignments.forEach(a => {
    checkObjectId(a.employeeId, 'employeeId');
    checkObjectId(a.shopId, 'shopId');
  });
  (input.staffingTargets || []).forEach(t => checkObjectId(t.shopId, 'shopId'));

  let rota = await WeeklyRota.findOne({ weekStart: week.weekStart });
  if (rota?.status === 'ARCHIVED') throw new RotaError(409, 'This rota has been archived and can no longer be edited.');
  if (rota?.status === 'PUBLISHED' && input.revisePublished !== true) {
    throw new RotaError(409, 'This rota is published. Confirm a revision before changing it.');
  }
  for (const locked of (rota?.assignments || []).filter(a => a.locked)) {
    const retained = input.assignments.find(a => id(a.employeeId) === id(locked.employeeId) && a.dateKey === locked.dateKey);
    if (!retained || id(retained.shopId) !== id(locked.shopId) ||
        retained.startTime !== locked.startTime || retained.endTime !== locked.endTime || !retained.locked) {
      throw new RotaError(409, `Locked shift for ${locked.dateKey} cannot be changed or removed.`);
    }
  }
  const validationTarget = rota || { _id: new mongoose.Types.ObjectId(), weekStart: week.weekStart };
  const validation = await buildValidation(validationTarget, input);
  const errors = validation.errors.filter(error =>
    !(input.assignments.length === 0 && error === 'Add at least one assignment before publishing this weekly rota.')
  );
  if (errors.length) {
    throw new RotaError(422, `Rota draft contains invalid assignments:\n${errors.map(error => `• ${error}`).join('\n')}`, {
      errors,
      validation: { ...validation, errors }
    });
  }
  rota ||= await getOrCreateRota(week);
  // Key includes homeShopId so multi-shop workers (in multiple rosters) don't
  // collide — each shop's view of a worker on a given day is kept separately.
  const makeKey = a => `${id(a.homeShopId || a.shopId)}:${id(a.employeeId)}:${a.dateKey}`;
  const previousByDay = new Map(rota.assignments.map(a => [makeKey(a), a]));
  const nextByDay = new Map(input.assignments.map(a => [makeKey(a), a]));
  rota.assignments = input.assignments.map(assignment => {
    const previous = previousByDay.get(makeKey(assignment));
    const startTime = assignment.startTime || '09:00';
    const endTime = assignment.endTime || '17:00';
    const scheduledHours = (minutes(endTime) - minutes(startTime)) / 60;
    return {
      ...assignment,
      startTime,
      endTime,
      scheduledHours: Math.max(0, scheduledHours),
      status: assignment.status || 'AVAILABLE',
      note: String(assignment.note || ''),
      homeShopId: assignment.homeShopId || null,
      ...(previous?._id ? { _id: previous._id } : {}),
      createdBy: previous?.createdBy || req.user._id,
      updatedBy: req.user._id
    };
  });
  if (Array.isArray(input.shopRoster)) {
    rota.shopRoster = input.shopRoster;
  }
  rota.staffingTargets = input.staffingTargets || [];
  rota.generationMethod = generationMethod;
  rota.instructionText = String(input.instructionText || '').slice(0, 5000);
  rota.status = 'DRAFT';
  rota.validation = validation;
  rota.updatedBy = req.user._id;
  if (!rota.createdBy) rota.createdBy = req.user._id;
  await rota.save();
  for (const key of new Set([...previousByDay.keys(), ...nextByDay.keys()])) {
    const previous = previousByDay.get(key);
    const next = nextByDay.get(key);
    let action;
    let description;
    if (!previous && next) {
      action = 'ROTA_ASSIGNMENT_ADDED';
      description = `Added assignment ${key} at shop ${id(next.shopId)} (${next.startTime}-${next.endTime}).`;
    } else if (previous && !next) {
      action = 'ROTA_ASSIGNMENT_REMOVED';
      description = `Removed assignment ${key} from shop ${id(previous.shopId)}.`;
    } else if (previous && next && (
      id(previous.shopId) !== id(next.shopId) ||
      previous.startTime !== next.startTime ||
      previous.endTime !== next.endTime
    )) {
      action = 'ROTA_ASSIGNMENT_CHANGED';
      description = `Changed assignment ${key} to shop ${id(next.shopId)} (${next.startTime}-${next.endTime}).`;
    }
    if (action) {
      await logAction({
        user: req.user,
        action,
        recordType: 'WeeklyRota',
        recordId: rota._id,
        details: description,
        req
      });
    }
  }
  await logAction({
    user: req.user, action: 'ROTA_DRAFT_SAVED', recordType: 'WeeklyRota', recordId: rota._id,
    details: `Saved ${week.weekStart} rota draft using ${generationMethod}.`, req
  });
  return res.json({ success: true, rota: cleanRota(rota), validation });
}

function handleError(res, error) {
  if (error instanceof RotaError) return res.status(error.status).json({ success: false, message: error.message, ...error.details });
  if (error?.code === 11000) return res.status(409).json({ success: false, message: 'An employee already has a published shift on that date.' });
  if (error?.name === 'VersionError') return res.status(409).json({ success: false, message: 'This rota changed in another request. Refresh it and retry your changes.' });
  if (error?.name === 'ValidationError' || error?.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'The rota request contains invalid data.' });
  }
  console.error('Rota API request failed:', error?.message || error);
  return res.status(500).json({ success: false, message: 'Unable to complete the rota request.' });
}

exports.dashboard = async (req, res) => {
  try {
    return res.json(await getWeekData(req.query.weekStart));
  } catch (error) {
    if (error.message?.includes('weekStart')) return handleError(res, new RotaError(400, error.message));
    return handleError(res, error);
  }
};

exports.getWeek = async (req, res) => {
  try {
    return res.json(await getWeekData(req.params.weekStart));
  } catch (error) {
    if (error.message?.includes('weekStart')) return handleError(res, new RotaError(400, error.message));
    return handleError(res, error);
  }
};

exports.saveDraft = async (req, res) => {
  try { return await persistDraft(req, res, req.body); } catch (error) { return handleError(res, error); }
};

exports.setAssignmentLock = async (req, res) => {
  try {
    const week = getWeek(req.params.weekStart);
    checkObjectId(req.params.assignmentId, 'assignmentId');
    if (typeof req.body.locked !== 'boolean') throw new RotaError(400, 'locked must be a boolean.');
    const rota = await WeeklyRota.findOne({ weekStart: week.weekStart });
    if (!rota) throw new RotaError(404, 'No rota draft exists for this week.');
    if (rota.status === 'ARCHIVED') throw new RotaError(409, 'An archived rota cannot be changed.');
    if (rota.status === 'PUBLISHED' && req.body.revisePublished !== true) {
      throw new RotaError(409, 'This rota is published. Confirm a revision before changing it.');
    }
    const assignment = rota.assignments.id(req.params.assignmentId);
    if (!assignment) throw new RotaError(404, 'Rota assignment not found.');
    assignment.locked = req.body.locked;
    if (rota.status === 'PUBLISHED') rota.status = 'DRAFT';
    rota.updatedBy = req.user._id;
    await rota.save();
    await logAction({
      user: req.user,
      action: req.body.locked ? 'ROTA_ASSIGNMENT_LOCKED' : 'ROTA_ASSIGNMENT_UNLOCKED',
      recordType: 'WeeklyRota',
      recordId: rota._id,
      details: `${req.body.locked ? 'Locked' : 'Unlocked'} assignment ${assignment._id} for ${assignment.dateKey}.`,
      req
    });
    return res.json({ success: true, rota: cleanRota(rota) });
  } catch (error) {
    if (error.message?.includes('weekStart')) return handleError(res, new RotaError(400, error.message));
    return handleError(res, error);
  }
};

exports.validateWeek = async (req, res) => {
  try {
    const week = getWeek(req.params.weekStart);
    const rota = await WeeklyRota.findOne({ weekStart: week.weekStart });
    if (!rota) throw new RotaError(404, 'No rota draft exists for this week.');
    const validation = await buildValidation(rota, rota);
    rota.validation = validation;
    await rota.save();
    return res.json({ success: true, rota: cleanRota(rota), validation });
  } catch (error) {
    if (error.message?.includes('weekStart')) return handleError(res, new RotaError(400, error.message));
    return handleError(res, error);
  }
};

exports.publish = async (req, res) => {
  let session;
  try {
    const week = getWeek(req.params.weekStart);
    const rota = await WeeklyRota.findOne({ weekStart: week.weekStart });
    if (!rota) throw new RotaError(404, 'No rota draft exists for this week.');
    if (rota.status === 'ARCHIVED') throw new RotaError(409, 'An archived rota cannot be published.');
    const validation = await buildValidation(rota, rota);
    rota.validation = validation;
    if (!validation.valid) {
      await rota.save();
      return res.status(422).json({ success: false, message: 'Rota has validation errors and cannot be published.', rota: cleanRota(rota), validation });
    }
    await RotaAssignmentClaim.init();
    session = await mongoose.startSession();
    session.startTransaction();
    const newClaims = rota.assignments.map(assignment => ({
      employeeId: assignment.employeeId, dateKey: assignment.dateKey, rotaId: rota._id,
      assignmentId: assignment._id, shopId: assignment.shopId
    }));
    const retainedKeys = new Set(newClaims.map(claim => `${id(claim.employeeId)}:${claim.dateKey}`));
    const priorClaims = await RotaAssignmentClaim.find({ rotaId: rota._id }).session(session);
    for (const claim of priorClaims) {
      if (!retainedKeys.has(`${id(claim.employeeId)}:${claim.dateKey}`)) {
        await RotaAssignmentClaim.deleteOne({ _id: claim._id }, { session });
      }
    }
    for (const claim of newClaims) {
      await RotaAssignmentClaim.updateOne(
        { employeeId: claim.employeeId, dateKey: claim.dateKey },
        { $set: { ...claim } }, { upsert: true, session }
      );
    }
    const publishedAt = new Date();
    const version = {
      version: rota.publishedVersions.length + 1,
      assignments: rota.assignments,
      staffingTargets: rota.staffingTargets,
      generationMethod: rota.generationMethod,
      instructionText: rota.instructionText,
      publishedAt,
      publishedBy: req.user._id
    };
    rota.publishedVersions.push(version);
    rota.status = 'PUBLISHED';
    rota.publishedAt = publishedAt;
    rota.publishedBy = req.user._id;
    rota.updatedBy = req.user._id;
    await rota.save({ session });
    await session.commitTransaction();
    await logAction({
      user: req.user, action: 'ROTA_PUBLISHED', recordType: 'WeeklyRota', recordId: rota._id,
      details: `Published ${week.weekStart} rota version ${version.version}.`, req
    });
    return res.json({ success: true, rota: cleanRota(rota), validation });
  } catch (error) {
    if (session?.inTransaction()) await session.abortTransaction().catch(() => {});
    if (error.message?.includes('weekStart')) return handleError(res, new RotaError(400, error.message));
    return handleError(res, error);
  } finally {
    if (session) await session.endSession();
  }
};

exports.archive = async (req, res) => {
  try {
    const week = getWeek(req.params.weekStart);
    const rota = await WeeklyRota.findOne({ weekStart: week.weekStart });
    if (!rota) throw new RotaError(404, 'No rota exists for this week.');
    if (rota.status !== 'PUBLISHED') throw new RotaError(409, 'Only a published rota can be archived.');
    rota.status = 'ARCHIVED';
    rota.updatedBy = req.user._id;
    await rota.save();
    await logAction({
      user: req.user,
      action: 'ROTA_ARCHIVED',
      recordType: 'WeeklyRota',
      recordId: rota._id,
      details: `Archived the ${week.weekStart} weekly rota.`,
      req
    });
    return res.json({ success: true, rota: cleanRota(rota) });
  } catch (error) {
    if (error.message?.includes('weekStart')) return handleError(res, new RotaError(400, error.message));
    return handleError(res, error);
  }
};

exports.discardDraft = async (req, res) => {
  try {
    const week = getWeek(req.params.weekStart);
    const rota = await WeeklyRota.findOne({ weekStart: week.weekStart });
    if (!rota) throw new RotaError(404, 'No draft exists for this week.');
    if (rota.publishedVersions.length || rota.status === 'PUBLISHED' || rota.status === 'ARCHIVED') {
      throw new RotaError(409, 'A rota with publication history cannot be discarded. Archive it instead.');
    }
    await WeeklyRota.deleteOne({ _id: rota._id });
    await logAction({
      user: req.user,
      action: 'ROTA_DRAFT_DISCARDED',
      recordType: 'WeeklyRota',
      recordId: rota._id,
      details: `Discarded the ${week.weekStart} rota draft.`,
      req
    });
    return res.json({ success: true });
  } catch (error) {
    if (error.message?.includes('weekStart')) return handleError(res, new RotaError(400, error.message));
    return handleError(res, error);
  }
};

function validateAvailabilityEntry(entry) {
  if (!entry || !mongoose.isValidObjectId(entry.employeeId)) throw new RotaError(400, 'employeeId must be a valid ID.');
  if (!isDateKey(entry.dateKey)) throw new RotaError(400, 'dateKey must be a valid YYYY-MM-DD date.');
  if (!['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'].includes(entry.status)) throw new RotaError(400, 'status must be AVAILABLE, UNAVAILABLE, or UNKNOWN.');
  if (typeof entry.confirmed !== 'boolean') throw new RotaError(400, 'confirmed must be a boolean.');
  const intervalError = validateIntervals(entry.intervals || []);
  if (intervalError) throw new RotaError(400, intervalError);
  if (entry.status !== 'AVAILABLE' && (entry.intervals || []).length) {
    throw new RotaError(400, 'Intervals may only be provided for AVAILABLE status.');
  }
  return {
    employeeId: entry.employeeId, dateKey: entry.dateKey, status: entry.status,
    intervals: entry.intervals || [], confirmed: entry.confirmed,
    reason: String(entry.reason || '').slice(0, 1000)
  };
}

exports.saveAvailability = async (req, res) => {
  try {
    const data = validateAvailabilityEntry(req.body);
    const employee = await Employee.findById(data.employeeId).select('employmentStatus');
    if (!employee) throw new RotaError(404, 'Employee not found.');
    if (employee.employmentStatus !== 'Active') throw new RotaError(400, 'Availability can only be set for an active employee.');
    await RotaAvailability.init();
    const availability = await RotaAvailability.findOneAndUpdate(
      { employeeId: data.employeeId, dateKey: data.dateKey },
      { $set: { ...data, updatedBy: req.user._id }, $setOnInsert: { createdBy: req.user._id } }, { new: true, upsert: true, runValidators: true }
    );
    await logAction({ user: req.user, action: 'ROTA_AVAILABILITY_UPDATED', recordType: 'RotaAvailability', recordId: availability._id, details: `Updated availability for ${data.dateKey}.`, req });
    return res.json({ success: true, availability });
  } catch (error) { return handleError(res, error); }
};

exports.saveAvailabilityBulk = async (req, res) => {
  try {
    if (!Array.isArray(req.body.entries) || !req.body.entries.length || req.body.entries.length > 500) {
      throw new RotaError(400, 'entries must contain between 1 and 500 availability entries.');
    }
    const entries = req.body.entries.map(validateAvailabilityEntry);
    const unique = new Set(entries.map(entry => `${entry.employeeId}:${entry.dateKey}`));
    if (unique.size !== entries.length) throw new RotaError(400, 'Bulk availability cannot contain duplicate employee/date entries.');
    const employeeIds = [...new Set(entries.map(entry => entry.employeeId))];
    const activeEmployees = await Employee.find({ _id: { $in: employeeIds }, employmentStatus: 'Active' }).select('_id');
    if (activeEmployees.length !== employeeIds.length) throw new RotaError(400, 'Every availability entry must belong to an active employee.');
    await RotaAvailability.init();
    const operations = entries.map(data => ({
      updateOne: {
        filter: { employeeId: data.employeeId, dateKey: data.dateKey },
        update: { $set: { ...data, updatedBy: req.user._id }, $setOnInsert: { createdBy: req.user._id } },
        upsert: true
      }
    }));
    await RotaAvailability.bulkWrite(operations, { ordered: true });
    const availability = await RotaAvailability.find({
      $or: entries.map(entry => ({ employeeId: entry.employeeId, dateKey: entry.dateKey }))
    });
    await logAction({ user: req.user, action: 'ROTA_AVAILABILITY_BULK_UPDATED', recordType: 'RotaAvailability', details: `Updated ${entries.length} availability records.`, req });
    return res.json({ success: true, availability });
  } catch (error) { return handleError(res, error); }
};

exports.getAvailability = async (req, res) => {
  try {
    const week = getWeek(req.query.weekStart);
    const availability = await RotaAvailability.find({ dateKey: { $gte: week.weekStart, $lte: week.weekEnd } }).sort({ dateKey: 1 }).lean();
    return res.json({ success: true, weekStart: week.weekStart, weekEnd: week.weekEnd, availability });
  } catch (error) {
    if (error.message?.includes('weekStart')) return handleError(res, new RotaError(400, error.message));
    return handleError(res, error);
  }
};

exports.history = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
    const rotas = await WeeklyRota.find({ 'publishedVersions.0': { $exists: true } })
      .sort({ updatedAt: -1 }).limit(limit).select('weekStart weekEnd status publishedVersions updatedAt').lean();
    return res.json({ success: true, rotas });
  } catch (error) { return handleError(res, error); }
};

exports.employeeWeek = async (req, res) => {
  try {
    const week = getWeek(req.params.weekStart);
    checkObjectId(req.params.employeeId, 'employeeId');
    const employee = await Employee.findById(req.params.employeeId).select('name employeeId employmentStatus');
    if (!employee) throw new RotaError(404, 'Employee not found.');
    const [rota, availability] = await Promise.all([
      WeeklyRota.findOne({ weekStart: week.weekStart }).lean(),
      RotaAvailability.find({ employeeId: employee._id, dateKey: { $gte: week.weekStart, $lte: week.weekEnd } }).sort({ dateKey: 1 }).lean()
    ]);
    const assignments = (rota?.assignments || []).filter(item => id(item.employeeId) === id(employee._id));
    return res.json({ success: true, weekStart: week.weekStart, weekEnd: week.weekEnd, employee, assignments, availability, rota: rota ? { ...rota, assignments } : null });
  } catch (error) {
    if (error.message?.includes('weekStart')) return handleError(res, new RotaError(400, error.message));
    return handleError(res, error);
  }
};

async function getExportData(weekStart, employeeId) {
  const week = getWeek(weekStart);
  const rota = await WeeklyRota.findOne({ weekStart: week.weekStart }).lean();
  if (!rota) throw new RotaError(404, 'No rota exists for this week.');
  const query = employeeId ? { _id: employeeId } : { _id: { $in: [...new Set(rota.assignments.map(a => a.employeeId))] } };
  const [employees, shops] = await Promise.all([
    Employee.find(query).select('name employeeId').lean(),
    Shop.find({ _id: { $in: [...new Set(rota.assignments.map(a => a.shopId))] } }).select('name code').lean()
  ]);
  const employeesById = new Map(employees.map(employee => [id(employee._id), employee]));
  const shopsById = new Map(shops.map(shop => [id(shop._id), shop]));
  const assignments = rota.assignments
    .filter(a => !employeeId || id(a.employeeId) === id(employeeId))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startTime.localeCompare(b.startTime));
  return { week, rota, assignments, employeesById, shopsById };
}

const SHOP_EXPORT_PALETTE = {
  station:   { name: 'Station Cycles',   excelFill: 'FFCCE5FF', pdfHex: '#cce5ff', text: '#002060' },
  camden:    { name: 'Camden Cycles',    excelFill: 'FFFFF3CD', pdfHex: '#fff3cd', text: '#664d03' },
  chelsea:   { name: 'Chelsea Bikes',    excelFill: 'FFD1ECF1', pdfHex: '#d1ecf1', text: '#055160' },
  edgware:   { name: 'Edgware Cycles',   excelFill: 'FFA5F3FC', pdfHex: '#a5f3fc', text: '#004d40' },
  southwark: { name: 'Southwark Cycles', excelFill: 'FFFEF08A', pdfHex: '#fef08a', text: '#554400' },
  leebridge: { name: 'Leebridge Cycles', excelFill: 'FFD4EDDA', pdfHex: '#d4edda', text: '#0f5132' },
  leabridge: { name: 'Leebridge Cycles', excelFill: 'FFD4EDDA', pdfHex: '#d4edda', text: '#0f5132' }
};

function getShopPalette(shopName = '') {
  const lower = String(shopName || '').toLowerCase();
  for (const [key, val] of Object.entries(SHOP_EXPORT_PALETTE)) {
    if (lower.includes(key)) return val;
  }
  return { name: shopName, excelFill: 'FFE2E8F0', pdfHex: '#e2e8f0', text: '#1e293b' };
}

exports.exportExcel = async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    if (employeeId) checkObjectId(employeeId, 'employeeId');
    const weekStart = req.params.weekStart;
    const week = getWeek(weekStart);

    // If single employee export requested
    if (employeeId) {
      const data = await getExportData(weekStart, employeeId);
      if (!data.employeesById.has(employeeId)) throw new RotaError(404, 'Employee not found or has no shifts in this rota.');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Weekly Rota');
      sheet.columns = [
        { header: 'Date', key: 'date', width: 14 }, { header: 'Employee', key: 'employee', width: 28 },
        { header: 'Employee ID', key: 'employeeId', width: 16 }, { header: 'Shop', key: 'shop', width: 26 },
        { header: 'Start', key: 'start', width: 12 }, { header: 'End', key: 'end', width: 12 },
        { header: 'Locked', key: 'locked', width: 12 }
      ];
      for (const assignment of data.assignments) {
        const employee = data.employeesById.get(id(assignment.employeeId));
        const shop = data.shopsById.get(id(assignment.shopId));
        sheet.addRow({
          date: assignment.dateKey, employee: employee?.name || '', employeeId: employee?.employeeId || '',
          shop: shop?.name || '', start: assignment.startTime, end: assignment.endTime,
          locked: assignment.locked ? 'Yes' : 'No'
        });
      }
      sheet.getRow(1).font = { bold: true };
      await logAction({
        user: req.user,
        action: 'ROTA_EXPORTED',
        recordType: 'WeeklyRota',
        details: `Exported employee ${employeeId} rota for ${data.week.weekStart} as Excel.`,
        req
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="rota-employee-${data.week.weekStart}.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    // FULL MULTI-SHOP UNIFIED ROTA SPREADSHEET (Matches uploaded template)
    const rota = await WeeklyRota.findOne({ weekStart: week.weekStart })
      .populate('shopRoster.shopId', 'name')
      .populate('shopRoster.employeeIds', 'name')
      .lean();
    if (!rota) throw new RotaError(404, 'No rota exists for this week.');

    const allShops = await Shop.find({ isActive: true }).select('name').lean();
    const shopsById = {};
    allShops.forEach(s => { shopsById[id(s._id)] = s.name; });

    // Cell lookup — keyed by homeShopId:empId:dateKey
    const cellMap = {};
    for (const a of (rota.assignments || [])) {
      const hId = id(a.homeShopId || a.shopId);
      const eId = id(a.employeeId);
      const dKey = String(a.dateKey).slice(0, 10);
      cellMap[`${hId}:${eId}:${dKey}`] = a;
    }
    const employeeDayAssignments = getEmployeeDayAssignments(rota.assignments, shopsById);

    // Shop roster lookup
    const rosterMap = {};
    for (const sr of (rota.shopRoster || [])) {
      const sId = id(sr.shopId?._id || sr.shopId);
      rosterMap[sId] = {
        shopName: sr.shopId?.name || '',
        employees: (sr.employeeIds || []).map(e => ({ _id: id(e._id || e), name: e.name || '' }))
      };
    }

    const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    const weekDates = [];
    const base = new Date(`${week.weekStart}T12:00:00.000Z`);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const formatted = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
      const shortDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
      weekDates.push({ iso, formatted, shortDate, dayLabel: DAYS[i] });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('ROTA', { views: [{ showGridLines: true }] });

    sheet.columns = [
      { width: 22 }, // A: Name
      { width: 18 }, // B: Sun
      { width: 18 }, // C: Mon
      { width: 18 }, // D: Tue
      { width: 18 }, // E: Wed
      { width: 18 }, // F: Thu
      { width: 18 }, // G: Fri
      { width: 18 }  // H: Sat
    ];

    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };
    const thickBottom = {
      ...thinBorder,
      bottom: { style: 'medium', color: { argb: 'FF000000' } }
    };

    // Row 1: ROTA Title Banner
    sheet.mergeCells('A1:H1');
    const titleRow = sheet.getRow(1);
    titleRow.height = 30;
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'ROTA';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF0F172A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    // Row 2: Subtitle with Date Range
    sheet.mergeCells('A2:H2');
    const subRow = sheet.getRow(2);
    subRow.height = 20;
    const subCell = sheet.getCell('A2');
    subCell.value = `(${weekDates[0].shortDate} to ${weekDates[6].shortDate})`;
    subCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF475569' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    // Row 3: Top Date Bar
    const topDateRow = sheet.getRow(3);
    topDateRow.height = 20;
    sheet.getCell('A3').value = '';
    sheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    sheet.getCell('A3').border = thinBorder;
    for (let i = 0; i < 7; i++) {
      const colLetter = String.fromCharCode(66 + i);
      const c = sheet.getCell(`${colLetter}3`);
      c.value = weekDates[i].formatted;
      c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1E293B' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      c.border = thinBorder;
    }

    let currentRowNum = 4;
    const grandTotals = new Array(7).fill(0);

    const shopOrder = allShops.map(s => id(s._id)).filter(sid => rosterMap[sid]);
    Object.keys(rosterMap).forEach(sid => { if (!shopOrder.includes(sid)) shopOrder.push(sid); });

    for (const shopId of shopOrder) {
      const roster = rosterMap[shopId];
      if (!roster || roster.employees.length === 0) continue;
      const palette = getShopPalette(roster.shopName);

      // Shop Header Row (Merged A..H)
      sheet.mergeCells(`A${currentRowNum}:H${currentRowNum}`);
      const sHRow = sheet.getRow(currentRowNum);
      sHRow.height = 26;
      const sHCell = sheet.getCell(`A${currentRowNum}`);
      sHCell.value = roster.shopName;
      sHCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF0F172A' } };
      sHCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sHCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.excelFill } };
      for (let c = 1; c <= 8; c++) {
        sheet.getRow(currentRowNum).getCell(c).border = thickBottom;
      }
      currentRowNum++;

      // Subheader Row 1: Name | Dates
      const subH1 = sheet.getRow(currentRowNum);
      subH1.height = 18;
      const nCell = subH1.getCell(1);
      nCell.value = 'Name';
      nCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF334155' } };
      nCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      nCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.excelFill } };
      nCell.border = thinBorder;
      for (let i = 0; i < 7; i++) {
        const c = subH1.getCell(2 + i);
        c.value = weekDates[i].formatted;
        c.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF475569' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.excelFill } };
        c.border = thinBorder;
      }
      currentRowNum++;

      // Subheader Row 2: (blank) | SUNDAY, MONDAY...
      const subH2 = sheet.getRow(currentRowNum);
      subH2.height = 18;
      const blankN = subH2.getCell(1);
      blankN.value = '';
      blankN.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.excelFill } };
      blankN.border = thinBorder;
      for (let i = 0; i < 7; i++) {
        const c = subH2.getCell(2 + i);
        c.value = weekDates[i].dayLabel;
        c.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF1E293B' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.excelFill } };
        c.border = thinBorder;
      }
      currentRowNum++;

      // Worker Rows
      const shopTotals = new Array(7).fill(0);
      roster.employees.forEach((emp, empIdx) => {
        const row = sheet.getRow(currentRowNum);
        row.height = 20;
        const nameC = row.getCell(1);
        nameC.value = emp.name;
        nameC.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
        nameC.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        nameC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: empIdx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' } };
        nameC.border = thinBorder;

        for (let i = 0; i < 7; i++) {
          const c = row.getCell(2 + i);
          const key = `${shopId}:${emp._id}:${weekDates[i].iso}`;
          const cell = cellMap[key];
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: empIdx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' } };
          c.border = thinBorder;
          c.alignment = { horizontal: 'center', vertical: 'middle' };

          if (!cell) {
            const dayAssignment = employeeDayAssignments.get(`${emp._id}:${weekDates[i].iso}`);
            if (dayAssignment?.status === 'OFF') {
              // Worker is marked OFF anywhere in the system → show OFF in bold red
              c.value = 'OFF';
              c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFDC2626' } };
            } else if (dayAssignment?.status === 'WORKING' && dayAssignment.shopId !== shopId) {
              // Worker is assigned to a different shop — show that shop name (blue, like LOANED)
              c.value = dayAssignment.shopName;
              c.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF2563EB' } };
            } else {
              // No assignment anywhere — show Available and count in totals
              shopTotals[i]++;
              grandTotals[i]++;
              c.value = 'Available';
              c.font = { name: 'Arial', size: 8, bold: false, color: { argb: 'FF0F172A' } };
            }
          } else if (cell.status === 'OFF') {
            const dayAssignment = employeeDayAssignments.get(`${emp._id}:${weekDates[i].iso}`);
            if (dayAssignment?.status === 'WORKING' && dayAssignment.shopId !== shopId) {
              c.value = dayAssignment.shopName;
              c.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF2563EB' } };
            } else {
              c.value = 'OFF';
              c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFDC2626' } };
            }
          } else if (cell.status === 'LOANED') {
            const targetShop = shopsById[id(cell.targetShopId)] || cell.note || 'Loaned';
            c.value = targetShop;
            c.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF2563EB' } };
          } else {
            // AVAILABLE / CUSTOM
            shopTotals[i]++;
            grandTotals[i]++;
            if (cell.status === 'CUSTOM' && cell.note) {
              c.value = cell.note;
              c.font = { name: 'Arial', size: 8, bold: false, color: { argb: 'FF0F172A' } };
            } else {
              c.value = cell.note ? `Available (${cell.note})` : 'Available';
              c.font = { name: 'Arial', size: 8, bold: false, color: { argb: 'FF0F172A' } };
            }
          }
        }
        currentRowNum++;
      });

      // Total Row for this Shop
      const totRow = sheet.getRow(currentRowNum);
      totRow.height = 20;
      const tLabel = totRow.getCell(1);
      tLabel.value = 'Total';
      tLabel.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF1E293B' } };
      tLabel.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      tLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      tLabel.border = thinBorder;

      for (let i = 0; i < 7; i++) {
        const c = totRow.getCell(2 + i);
        c.value = shopTotals[i];
        c.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF0F172A' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        c.border = thinBorder;
      }
      currentRowNum++;
    }

    // Grand Total Row (Bottom across all shops)
    const gRow = sheet.getRow(currentRowNum);
    gRow.height = 24;
    const gLabel = gRow.getCell(1);
    gLabel.value = 'Grand Total';
    gLabel.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    gLabel.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    gLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    gLabel.border = thickBottom;

    for (let i = 0; i < 7; i++) {
      const c = gRow.getCell(2 + i);
      c.value = grandTotals[i];
      c.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      c.border = thickBottom;
    }

    await logAction({
      user: req.user,
      action: 'ROTA_EXPORTED',
      recordType: 'WeeklyRota',
      details: `Exported weekly rota for ${week.weekStart} as Excel (Multi-Shop Sheet).`,
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Rota_${week.weekStart}.xlsx"`);
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) { return handleError(res, error); }
};

exports.exportPdf = async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    if (employeeId) checkObjectId(employeeId, 'employeeId');

    const weekStart = req.params.weekStart;
    const week = getWeek(weekStart);
    const currentScreenSnapshot = req.method === 'POST';
    let rota;
    if (currentScreenSnapshot) {
      const assignments = req.body?.assignments;
      const shopRoster = req.body?.shopRoster;
      const generationMethod = req.body?.generationMethod || 'MANUAL';
      const structuralError = validatePayload(assignments, undefined, generationMethod);
      if (structuralError) throw new RotaError(400, structuralError);
      if (!Array.isArray(shopRoster)) throw new RotaError(400, 'shopRoster must be an array.');
      if (assignments.some(assignment => !dateInWeek(assignment.dateKey, week.weekStart))) {
        throw new RotaError(400, 'All assignments must fall within the selected rota week.');
      }

      for (const assignment of assignments) {
        checkObjectId(assignment.employeeId, 'employeeId');
        checkObjectId(assignment.shopId, 'shopId');
      }
      const duplicateAssignments = findDuplicateEmployeeDates(assignments);
      if (duplicateAssignments.length) {
        throw new RotaError(422, 'The current rota contains conflicting assignments.', {
          conflicts: duplicateAssignments
        });
      }
      for (const roster of shopRoster) {
        checkObjectId(roster.shopId, 'shopId');
        if (!Array.isArray(roster.employeeIds)) throw new RotaError(400, 'Each shop roster must contain an employeeIds array.');
        roster.employeeIds.forEach(idValue => checkObjectId(idValue, 'employeeId'));
      }
      rota = { assignments, shopRoster };
    } else {
      rota = await WeeklyRota.findOne({ weekStart: week.weekStart })
        .populate('shopRoster.shopId', 'name')
        .populate('shopRoster.employeeIds', 'name')
        .lean();
      if (!rota) throw new RotaError(404, 'No rota exists for this week.');
    }

    // Fetch all shops in order
    const allShops = await Shop.find({ isActive: true }).select('name').lean();
    const shopsById = {};
    allShops.forEach(shop => { shopsById[id(shop._id)] = shop.name; });

    let employeesById = null;
    if (currentScreenSnapshot) {
      const employeeIds = [...new Set(rota.shopRoster.flatMap(roster => roster.employeeIds.map(id)) )];
      const employees = employeeIds.length
        ? await Employee.find({ _id: { $in: employeeIds } }).select('name').lean()
        : [];
      employeesById = new Map(employees.map(employee => [id(employee._id), employee]));
      if (employeesById.size !== employeeIds.length) {
        throw new RotaError(400, 'The current screen rota references an employee that no longer exists.');
      }
      if (rota.shopRoster.some(roster => !shopsById[id(roster.shopId)])) {
        throw new RotaError(400, 'The current screen rota references a shop that is not active.');
      }
    }

    // Build shopRoster lookup
    const rosterMap = {};
    for (const sr of (rota.shopRoster || [])) {
      const sId = id(sr.shopId?._id || sr.shopId);
      rosterMap[sId] = {
        shopName: sr.shopId?.name || shopsById[sId] || '',
        employees: (sr.employeeIds || []).map(e => {
          const employeeIdValue = id(e._id || e);
          return {
            _id: employeeIdValue,
            name: e.name || employeesById?.get(employeeIdValue)?.name || ''
          };
        })
      };
    }

    const cellMap = {};
    for (const a of (rota.assignments || [])) {
      const hId = id(a.homeShopId || a.shopId);
      const eId = id(a.employeeId);
      const dKey = String(a.dateKey).slice(0, 10);
      cellMap[`${hId}:${eId}:${dKey}`] = a;
    }

    const employeeDayAssignments = getEmployeeDayAssignments(rota.assignments, shopsById);

    // Week days: Sun -> Sat
    const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const DAY_LABELS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    const weekDates = [];
    const base = new Date(`${week.weekStart}T12:00:00.000Z`);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
      weekDates.push({ iso, formatted, day: DAYS[i], dayLabel: DAY_LABELS[i] });
    }

    // PDF setup
    const PAGE_W = 841.89; // A4 landscape width
    const PAGE_H = 595.28; // A4 landscape height
    const MARGIN = 24;
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', layout: 'landscape' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Weekly_Rota_${weekStart}.pdf"`);
    doc.pipe(res);

    const usableW = PAGE_W - MARGIN * 2;
    const NAME_COL = 72;
    const DAY_COL = (usableW - NAME_COL) / 7;

    const COLORS = {
      headerBg:    '#1e293b',
      headerText:  '#ffffff',
      shopBg:      '#f8fafc',
      shopText:    '#1e293b',
      dateBg:      '#f1f5f9',
      dateText:    '#334155',
      offText:     '#dc2626',
      loanText:    '#2563eb',
      availText:   '#059669',
      rowAlt:      '#f8fafc',
      totalBg:     '#e2e8f0',
      totalText:   '#1e293b',
      border:      '#cbd5e1',
      white:       '#ffffff',
    };

    let y = MARGIN;

    const hLine = (yPos, color = COLORS.border) => {
      doc.strokeColor(color).lineWidth(0.4).moveTo(MARGIN, yPos).lineTo(MARGIN + usableW, yPos).stroke();
    };

    const fillRect = (x, yPos, w, h, bg) => {
      doc.rect(x, yPos, w, h).fillColor(bg).fill();
    };

    const cellText = (text, x, yPos, w, h, color, size, bold = false, align = 'center') => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(size)
         .fillColor(color)
         .text(text, x + 2, yPos + 2, { width: w - 4, height: h - 2, align, lineBreak: false });
    };

    const drawPageHeader = () => {
      const H = 22;
      fillRect(MARGIN, y, usableW, H, COLORS.headerBg);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.headerText)
         .text(`Weekly Staff Rota  ·  ${weekDates[0].formatted} – ${weekDates[6].formatted}`,
                MARGIN + 4, y + 6, { width: usableW - 8, align: 'center' });
      y += H;
      fillRect(MARGIN, y, NAME_COL, 18, COLORS.dateBg);
      for (let i = 0; i < 7; i++) {
        const x = MARGIN + NAME_COL + i * DAY_COL;
        fillRect(x, y, DAY_COL, 18, COLORS.dateBg);
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLORS.dateText)
           .text(weekDates[i].formatted, x + 1, y + 2, { width: DAY_COL - 2, align: 'center', lineBreak: false });
      }
      y += 18;
      hLine(y);
    };

    drawPageHeader();

    const grandTotals = new Array(7).fill(0);
    const shopOrder = allShops.map(s => id(s._id)).filter(sid => rosterMap[sid]);
    Object.keys(rosterMap).forEach(sid => { if (!shopOrder.includes(sid)) shopOrder.push(sid); });

    for (const shopId of shopOrder) {
      const roster = rosterMap[shopId];
      if (!roster || roster.employees.length === 0) continue;
      const palette = getShopPalette(roster.shopName);

      const ROW_H   = 14;
      const HEAD_H  = 16;
      const TOTAL_H = 13;
      const shopBlockH = HEAD_H + ROW_H + ROW_H + roster.employees.length * ROW_H + TOTAL_H;

      if (y + shopBlockH > PAGE_H - MARGIN - 25) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
        y = MARGIN;
        drawPageHeader();
      }

      fillRect(MARGIN, y, usableW, HEAD_H, palette.pdfHex);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(palette.text || COLORS.shopText)
         .text(roster.shopName, MARGIN, y + 4, { width: usableW, align: 'center', lineBreak: false });
      hLine(y); hLine(y + HEAD_H);
      y += HEAD_H;

      fillRect(MARGIN, y, NAME_COL, ROW_H, palette.pdfHex);
      cellText('Name', MARGIN, y, NAME_COL, ROW_H, COLORS.shopText, 6.5, true, 'left');
      for (let i = 0; i < 7; i++) {
        const x = MARGIN + NAME_COL + i * DAY_COL;
        fillRect(x, y, DAY_COL, ROW_H, palette.pdfHex);
        cellText(weekDates[i].formatted.replace(/ \d{4}$/, ''), x, y, DAY_COL, ROW_H, COLORS.dateText, 5.5, false);
      }
      hLine(y + ROW_H);
      y += ROW_H;

      fillRect(MARGIN, y, NAME_COL, ROW_H, palette.pdfHex);
      for (let i = 0; i < 7; i++) {
        const x = MARGIN + NAME_COL + i * DAY_COL;
        fillRect(x, y, DAY_COL, ROW_H, palette.pdfHex);
        cellText(weekDates[i].dayLabel, x, y, DAY_COL, ROW_H, COLORS.dateText, 5.5, true);
      }
      hLine(y + ROW_H);
      y += ROW_H;

      const totals = new Array(7).fill(0);
      roster.employees.forEach((emp, rowIdx) => {
        if (y + ROW_H > PAGE_H - MARGIN - 40) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
          y = MARGIN;
          drawPageHeader();
        }

        const rowBg = rowIdx % 2 === 0 ? COLORS.white : COLORS.rowAlt;
        fillRect(MARGIN, y, NAME_COL, ROW_H, rowBg);
        cellText(emp.name, MARGIN + 2, y, NAME_COL - 4, ROW_H, COLORS.shopText, 6, true, 'left');

        for (let i = 0; i < 7; i++) {
          const x = MARGIN + NAME_COL + i * DAY_COL;
          const key = `${shopId}:${emp._id}:${weekDates[i].iso}`;
          const cell = cellMap[key];
          fillRect(x, y, DAY_COL, ROW_H, rowBg);

          let label = 'Available';
          let color = COLORS.availText;
          if (cell) {
            if (cell.status === 'OFF') {
              const dayAssignment = employeeDayAssignments.get(`${emp._id}:${weekDates[i].iso}`);
              if (dayAssignment?.status === 'WORKING' && dayAssignment.shopId !== shopId) {
                label = dayAssignment.shopName;
                color = COLORS.loanText;
              } else {
                label = 'OFF';
                color = COLORS.offText;
              }
            } else if (cell.status === 'LOANED') {
              const targetShop = shopsById[id(cell.shopId)] || cell.note || 'Loaned';
              label = targetShop; color = COLORS.loanText;
            } else {
              label = cell.note ? `Avail. ${cell.note}` : 'Available';
              color = COLORS.availText;
              totals[i]++;
              grandTotals[i]++;
            }
          } else {
            const dayAssignment = employeeDayAssignments.get(`${emp._id}:${weekDates[i].iso}`);
            if (dayAssignment?.status === 'OFF') {
              label = 'OFF';
              color = COLORS.offText; // bold red
            } else if (dayAssignment?.status === 'WORKING' && dayAssignment.shopId !== shopId) {
              label = dayAssignment.shopName;
              color = COLORS.loanText; // blue — working at another shop
            } else {
              // No assignment anywhere — default to Available
              label = 'Available';
              color = COLORS.availText;
              totals[i]++;
              grandTotals[i]++;
            }
          }
          cellText(label, x, y, DAY_COL, ROW_H, color, 5.5, cell?.status === 'OFF' || label === 'OFF');
        }

        doc.strokeColor(COLORS.border).lineWidth(0.3);
        for (let i = 0; i <= 7; i++) {
          const lx = i === 0 ? MARGIN + NAME_COL : MARGIN + NAME_COL + i * DAY_COL;
          doc.moveTo(lx, y).lineTo(lx, y + ROW_H).stroke();
        }
        hLine(y + ROW_H);
        y += ROW_H;
      });

      fillRect(MARGIN, y, NAME_COL, TOTAL_H, COLORS.totalBg);
      cellText('Total', MARGIN + 2, y, NAME_COL, TOTAL_H, COLORS.totalText, 6, true, 'left');
      for (let i = 0; i < 7; i++) {
        const x = MARGIN + NAME_COL + i * DAY_COL;
        fillRect(x, y, DAY_COL, TOTAL_H, COLORS.totalBg);
        cellText(String(totals[i]), x, y, DAY_COL, TOTAL_H, COLORS.totalText, 6.5, true);
      }
      hLine(y); hLine(y + TOTAL_H);
      doc.rect(MARGIN, y - roster.employees.length * ROW_H - HEAD_H - 2 * ROW_H, usableW, roster.employees.length * ROW_H + HEAD_H + 2 * ROW_H + TOTAL_H)
         .strokeColor(COLORS.border).lineWidth(0.6).stroke();
      y += TOTAL_H + 6;
    }

    const GRAND_H = 15;
    if (y + GRAND_H > PAGE_H - MARGIN - 20) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
      y = MARGIN;
      drawPageHeader();
    }
    fillRect(MARGIN, y, NAME_COL, GRAND_H, '#94a3b8');
    cellText('Grand Total', MARGIN + 2, y, NAME_COL, GRAND_H, '#ffffff', 7, true, 'left');
    for (let i = 0; i < 7; i++) {
      const x = MARGIN + NAME_COL + i * DAY_COL;
      fillRect(x, y, DAY_COL, GRAND_H, '#e2e8f0');
      cellText(String(grandTotals[i]), x, y, DAY_COL, GRAND_H, '#0f172a', 8, true);
    }
    hLine(y); hLine(y + GRAND_H);
    y += GRAND_H + 8;

    // Footer
    const footerY = PAGE_H - MARGIN - 10;
    doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
       .text(`Generated by PIXX ROTA  ·  ${new Date().toLocaleDateString('en-GB')}`, MARGIN, footerY, { width: usableW, align: 'center' });

    await logAction({
      user: req.user,
      action: 'ROTA_EXPORTED',
      recordType: 'WeeklyRota',
      details: `Exported rota for ${weekStart} as PDF (Multi-Shop Sheet).`,
      req
    });

    doc.end();
    return undefined;
  } catch (error) { return handleError(res, error); }
};

exports.generateWithAI = async (req, res) => {
  try {
    const method = req.body.method;
    if (!['AI_TEXT', 'AI_VOICE'].includes(method)) throw new RotaError(400, 'method must be AI_TEXT or AI_VOICE.');
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 5000) throw new RotaError(400, 'text must contain 1 to 5000 characters.');
    const apiKey = process.env.ROTA_AI_API_KEY;
    if (!apiKey) throw new RotaError(503, 'Rota AI is not configured. Set ROTA_AI_API_KEY to enable generation.');
    if (typeof fetch !== 'function') throw new RotaError(503, 'Rota AI is unavailable on this server runtime.');

    const week = getWeek(req.params.weekStart);
    const [employees, shops, schedules, availability, existingRota] = await Promise.all([
      Employee.find({ employmentStatus: 'Active' }).select('name employeeId').sort({ name: 1, _id: 1 }).lean(),
      Shop.find({ status: 'Active', isActive: true }).select('name code').sort({ name: 1, _id: 1 }).lean(),
      ShopSchedule.find({ isActive: true }).lean(),
      RotaAvailability.find({ dateKey: { $gte: week.weekStart, $lte: week.weekEnd }, confirmed: true }).lean(),
      WeeklyRota.findOne({ weekStart: week.weekStart }).select('assignments staffingTargets status').lean()
    ]);
    if (existingRota?.status === 'ARCHIVED') throw new RotaError(409, 'This rota has been archived and cannot be regenerated.');
    const aiContext = createAiRosterContext(employees, shops, text);
    const prompt = [
      'Create a weekly employee rota from the provided text. Return only valid JSON with assignments and staffingTargets arrays.',
      'Each assignment must contain workerKey and shopKey chosen only from the supplied lists, dateKey (YYYY-MM-DD), startTime, endTime, and optional locked boolean.',
      'Each staffingTargets item must contain dateKey, shopKey, targetWorkers. Never invent keys, dates, employees, or shops.',
      `Selected week: ${week.weekStart} through ${week.weekEnd}.`,
      `User instruction with known employee names/IDs replaced by worker keys: ${aiContext.sanitizedInstruction}`,
      `Active employee keys: ${JSON.stringify(aiContext.employeeOptions)}`,
      `Active shops: ${JSON.stringify(aiContext.shopOptions)}`,
      `Shop schedules: ${JSON.stringify(schedules.map(s => ({ shopKey: aiContext.shopOptions.find(shop => aiContext.shopIds.get(shop.shopKey) === id(s.shop))?.shopKey || null, dayOfWeek: s.dayOfWeek, openingTime: s.openingTime, closingTime: s.closingTime })))}`,
      `Confirmed availability: ${JSON.stringify(availability.map(a => ({ workerKey: aiContext.employeeOptions.find(worker => aiContext.employeeIds.get(worker.workerKey) === id(a.employeeId))?.workerKey || null, dateKey: a.dateKey, status: a.status, intervals: a.intervals })))}`,
      `Assignments marked locked that must be preserved exactly: ${JSON.stringify((existingRota?.assignments || []).filter(a => a.locked).map(a => ({
        workerKey: aiContext.employeeOptions.find(worker => aiContext.employeeIds.get(worker.workerKey) === id(a.employeeId))?.workerKey || null,
        shopKey: aiContext.shopOptions.find(shop => aiContext.shopIds.get(shop.shopKey) === id(a.shopId))?.shopKey || null,
        dateKey: a.dateKey, startTime: a.startTime, endTime: a.endTime, locked: true
      })))}`,
      'Output example: {"assignments":[...],"staffingTargets":[]}'
    ].join('\n');
    const configuredBaseUrl = process.env.ROTA_AI_BASE_URL || 'https://api.openai.com/v1';
    let baseUrl;
    try {
      const providerUrl = new URL(configuredBaseUrl);
      if (providerUrl.protocol !== 'https:') throw new Error('HTTPS is required.');
      baseUrl = providerUrl.toString().replace(/\/+$/, '');
    } catch {
      throw new RotaError(503, 'Rota AI provider URL must be a valid HTTPS URL.');
    }
    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.ROTA_AI_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          messages: [{ role: 'system', content: 'You generate scheduling proposals and must follow the requested JSON schema.' }, { role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(30000)
      });
    } catch {
      throw new RotaError(502, 'Rota AI provider could not be reached.');
    }
    if (!response.ok) throw new RotaError(502, `Rota AI provider returned status ${response.status}.`);
    const providerResult = await response.json();
    const raw = providerResult?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') throw new RotaError(502, 'Rota AI provider returned an invalid response.');
    let generated;
    try {
      generated = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    } catch {
      throw new RotaError(502, 'Rota AI provider did not return valid JSON.');
    }
    if (!Array.isArray(generated.assignments)) throw new RotaError(502, 'Rota AI provider returned no assignment list.');
    let resolvedAssignments;
    let resolvedTargets;
    try {
      resolvedAssignments = resolveAiAssignments(generated.assignments, aiContext);
      resolvedTargets = (generated.staffingTargets || []).map(target => {
        const shopId = aiContext.shopIds.get(target?.shopKey);
        if (!shopId) throw new Error('AI output referenced an unknown shop.');
        return { shopId, dateKey: target.dateKey, targetWorkers: target.targetWorkers };
      });
    } catch {
      throw new RotaError(502, 'Rota AI provider returned an unknown employee or shop reference.');
    }
    const lockedAssignments = (existingRota?.assignments || []).filter(assignment => assignment.locked);
    const lockedKeys = new Set(lockedAssignments.map(assignment => `${id(assignment.employeeId)}:${assignment.dateKey}`));
    await logAction({
      user: req.user,
      action: 'ROTA_AI_DRAFT_GENERATED',
      recordType: 'WeeklyRota',
      details: `Generated an unpublished ${method} rota proposal for ${week.weekStart}.`,
      req
    });
    return await persistDraft(req, res, {
      assignments: [
        ...resolvedAssignments.filter(assignment => !lockedKeys.has(`${id(assignment.employeeId)}:${assignment.dateKey}`)),
        ...lockedAssignments.map(assignment => ({
          employeeId: assignment.employeeId,
          shopId: assignment.shopId,
          dateKey: assignment.dateKey,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          locked: true
        }))
      ],
      staffingTargets: resolvedTargets.length ? resolvedTargets : existingRota?.staffingTargets || [],
      instructionText: text,
      revisePublished: req.body.revisePublished === true
    }, method);
  } catch (error) {
    if (error.message?.includes('weekStart')) return handleError(res, new RotaError(400, error.message));
    return handleError(res, error);
  }
};
