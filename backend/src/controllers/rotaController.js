const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const ShopSchedule = require('../models/ShopSchedule');
const WeeklyRota = require('../models/WeeklyRota');
const RotaAvailability = require('../models/RotaAvailability');
const RotaAssignmentClaim = require('../models/RotaAssignmentClaim');
const { logAction } = require('../utils/audit');
const { getWeek, dateInWeek, minutes, validateIntervals, validatePayload, isDateKey } = require('../utils/rota');

class RotaError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
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

  assignments.forEach((assignment, index) => {
    if (!dateInWeek(assignment.dateKey, week.weekStart)) errors.push(`Assignment ${index + 1} is outside the rota week.`);
  });
  targets.forEach((target, index) => {
    if (!dateInWeek(target.dateKey, week.weekStart)) errors.push(`Staffing target ${index + 1} is outside the rota week.`);
  });

  const occupied = new Set();
  for (const assignment of assignments) {
    const key = `${id(assignment.employeeId)}:${assignment.dateKey}`;
    if (occupied.has(key)) errors.push(`${assignment.dateKey}: an employee can only have one shift per day.`);
    occupied.add(key);
  }

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

  for (const assignment of assignments) {
    const employee = employeeMap.get(id(assignment.employeeId));
    const shop = shopMap.get(id(assignment.shopId));
    const label = `${employee?.name || id(assignment.employeeId)} on ${assignment.dateKey}`;
    if (!employee) errors.push(`${label}: employee not found.`);
    else if (employee.employmentStatus !== 'Active') errors.push(`${label}: employee is not active.`);
    if (!shop) errors.push(`${label}: shop not found.`);
    else if (shop.status !== 'Active' || !shop.isActive) errors.push(`${label}: shop is not active.`);

    const availabilityRecord = availabilityMap.get(`${id(assignment.employeeId)}:${assignment.dateKey}`);
    if (!availabilityRecord || !availabilityRecord.confirmed || availabilityRecord.status === 'UNKNOWN') {
      errors.push(`${label}: availability has not been confirmed.`);
    } else if (availabilityRecord.status === 'UNAVAILABLE') {
      errors.push(`${label}: employee is unavailable.`);
    } else if (availabilityRecord.status !== 'AVAILABLE') {
      errors.push(`${label}: employee availability is not valid.`);
    } else if (availabilityRecord.intervals.length) {
      const start = minutes(assignment.startTime);
      const end = minutes(assignment.endTime);
      const covered = availabilityRecord.intervals.some(interval =>
        start >= minutes(interval.startTime) && end <= minutes(interval.endTime));
      if (!covered) errors.push(`${label}: shift is outside the employee's confirmed availability.`);
    }

    if (shop && dateInWeek(assignment.dateKey, week.weekStart)) {
      const day = new Date(`${assignment.dateKey}T00:00:00.000Z`).getUTCDay();
      const schedule = scheduleMap.get(`${id(shop._id)}:${day}`) || scheduleMap.get(`:${day}`);
      if (!schedule || !schedule.isActive) {
        errors.push(`${label}: no active shop schedule exists.`);
      } else {
        const opening = minutes(schedule.openingTime);
        const closing = minutes(schedule.closingTime);
        if (opening === null || closing === null || closing <= opening) {
          errors.push(`${label}: shop schedule has invalid opening hours.`);
        } else if (minutes(assignment.startTime) < opening || minutes(assignment.endTime) > closing) {
          errors.push(`${label}: shift must fit within shop hours (${schedule.openingTime}-${schedule.closingTime}).`);
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
    Employee.find({ employmentStatus: 'Active' }).select('name employeeId employmentStatus').sort({ name: 1 }).lean(),
    Shop.find({ status: 'Active', isActive: true }).select('name code').sort({ name: 1 }).lean(),
    RotaAvailability.find({ dateKey: { $gte: week.weekStart, $lte: week.weekEnd } }).sort({ dateKey: 1 }).lean(),
    ShopSchedule.find({ $or: [{ shop: { $in: await Shop.find({ status: 'Active', isActive: true }).distinct('_id') } }, { shop: null }] }).lean()
  ]);
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

  const rota = await getOrCreateRota(week);
  for (const locked of rota.assignments.filter(a => a.locked)) {
    const retained = input.assignments.find(a => id(a.employeeId) === id(locked.employeeId) && a.dateKey === locked.dateKey);
    if (!retained || id(retained.shopId) !== id(locked.shopId) ||
        retained.startTime !== locked.startTime || retained.endTime !== locked.endTime || !retained.locked) {
      throw new RotaError(409, `Locked shift for ${locked.dateKey} cannot be changed or removed.`);
    }
  }
  const validation = await buildValidation(rota, input);
  rota.assignments = input.assignments;
  rota.staffingTargets = input.staffingTargets || [];
  rota.generationMethod = generationMethod;
  rota.instructionText = String(input.instructionText || '').slice(0, 5000);
  rota.status = 'DRAFT';
  rota.validation = validation;
  rota.updatedBy = req.user._id;
  if (!rota.createdBy) rota.createdBy = req.user._id;
  await rota.save();
  await logAction({
    user: req.user, action: 'ROTA_DRAFT_SAVED', recordType: 'WeeklyRota', recordId: rota._id,
    details: `Saved ${week.weekStart} rota draft using ${generationMethod}.`, req
  });
  return res.json({ success: true, rota: cleanRota(rota), validation });
}

function handleError(res, error) {
  if (error instanceof RotaError) return res.status(error.status).json({ success: false, message: error.message });
  if (error?.code === 11000) return res.status(409).json({ success: false, message: 'An employee already has a published shift on that date.' });
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
    const assignment = rota.assignments.id(req.params.assignmentId);
    if (!assignment) throw new RotaError(404, 'Rota assignment not found.');
    assignment.locked = req.body.locked;
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
    const validation = await buildValidation(rota, rota);
    rota.validation = validation;
    if (!validation.valid) {
      await rota.save();
      return res.status(422).json({ success: false, message: 'Rota has validation errors and cannot be published.', rota: cleanRota(rota), validation });
    }
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
    const version = {
      version: rota.publishedVersions.length + 1,
      assignments: rota.assignments,
      staffingTargets: rota.staffingTargets,
      generationMethod: rota.generationMethod,
      instructionText: rota.instructionText,
      publishedAt: new Date(),
      publishedBy: req.user._id
    };
    rota.publishedVersions.push(version);
    rota.status = 'PUBLISHED';
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
    const availability = await RotaAvailability.findOneAndUpdate(
      { employeeId: data.employeeId, dateKey: data.dateKey },
      { $set: { ...data, updatedBy: req.user._id } }, { new: true, upsert: true, runValidators: true }
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
    const operations = entries.map(data => ({
      updateOne: {
        filter: { employeeId: data.employeeId, dateKey: data.dateKey },
        update: { $set: { ...data, updatedBy: req.user._id } },
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

exports.exportExcel = async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    if (employeeId) checkObjectId(employeeId, 'employeeId');
    const data = await getExportData(req.params.weekStart, employeeId);
    if (employeeId && !data.employeesById.has(employeeId)) throw new RotaError(404, 'Employee not found or has no shifts in this rota.');
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
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="rota-${employeeId ? 'employee-' : ''}${data.week.weekStart}.xlsx"`);
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) { return handleError(res, error); }
};

exports.exportPdf = async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    if (employeeId) checkObjectId(employeeId, 'employeeId');
    const data = await getExportData(req.params.weekStart, employeeId);
    if (employeeId && !data.employeesById.has(employeeId)) throw new RotaError(404, 'Employee not found or has no shifts in this rota.');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rota-${employeeId ? 'employee-' : ''}${data.week.weekStart}.pdf"`);
    doc.pipe(res);
    doc.fontSize(18).text(`Weekly Rota: ${data.week.weekStart} to ${data.week.weekEnd}`);
    doc.moveDown();
    doc.fontSize(10);
    for (const assignment of data.assignments) {
      const employee = data.employeesById.get(id(assignment.employeeId));
      const shop = data.shopsById.get(id(assignment.shopId));
      doc.text(`${assignment.dateKey}  ${assignment.startTime}-${assignment.endTime}  ${employee?.name || ''} (${employee?.employeeId || ''})  ${shop?.name || ''}${assignment.locked ? '  [Locked]' : ''}`);
    }
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
    const [employees, shops, schedules, availability] = await Promise.all([
      Employee.find({ employmentStatus: 'Active' }).select('name employeeId').lean(),
      Shop.find({ status: 'Active', isActive: true }).select('name code').lean(),
      ShopSchedule.find({ isActive: true }).lean(),
      RotaAvailability.find({ dateKey: { $gte: week.weekStart, $lte: week.weekEnd }, confirmed: true }).lean()
    ]);
    const prompt = [
      'Create a weekly employee rota from the provided text. Return only valid JSON with assignments and staffingTargets arrays.',
      'Each assignment must contain employeeId (database ID), shopId (database ID), dateKey (YYYY-MM-DD), startTime, endTime, and optional locked boolean.',
      'Each staffingTargets item must contain dateKey, shopId, targetWorkers. Never invent IDs, dates, availability, or shop schedules.',
      `Selected week: ${week.weekStart} through ${week.weekEnd}.`,
      `User instruction: ${text}`,
      `Active employees: ${JSON.stringify(employees.map(e => ({ id: id(e._id), name: e.name, employeeId: e.employeeId })))}`,
      `Active shops: ${JSON.stringify(shops.map(s => ({ id: id(s._id), name: s.name, code: s.code })))}`,
      `Shop schedules: ${JSON.stringify(schedules.map(s => ({ shopId: id(s.shop), dayOfWeek: s.dayOfWeek, openingTime: s.openingTime, closingTime: s.closingTime })))}`,
      `Confirmed availability: ${JSON.stringify(availability.map(a => ({ employeeId: id(a.employeeId), dateKey: a.dateKey, status: a.status, intervals: a.intervals })))}`,
      'Output example: {"assignments":[...],"staffingTargets":[]}'
    ].join('\n');
    const baseUrl = (process.env.ROTA_AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
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
    return await persistDraft(req, res, {
      assignments: generated.assignments,
      staffingTargets: generated.staffingTargets || [],
      instructionText: text
    }, method);
  } catch (error) {
    if (error.message?.includes('weekStart')) return handleError(res, new RotaError(400, error.message));
    return handleError(res, error);
  }
};
