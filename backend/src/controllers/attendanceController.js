const Attendance = require('../models/Attendance');
const { sendServerError } = require('../utils/httpErrors');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const SystemSetting = require('../models/SystemSetting');
const { calculateAttendanceRecord, formatUKDate, getUKDateString } = require('../utils/calc');
const { logAction } = require('../utils/audit');
const { attendanceOperatorRecord, attendanceCheckerRecord } = require('../utils/attendanceViews');

function attendanceResponse(req, record) {
  if (req.user.role === 'ATTENDANCE_OPERATOR') return attendanceOperatorRecord(record);
  if (req.user.role === 'ATTENDANCE_CHECKER') return attendanceCheckerRecord(record);
  return record;
}

// Helper to get configured grace period
async function getGracePeriod() {
  const setting = await SystemSetting.findOne({ key: 'GRACE_PERIOD_MINUTES' });
  return setting ? Number(setting.value) : 15;
}

/**
 * Usman / Attendance Operator saves a single attendance record or delegates if batch
 */
exports.saveAttendance = async (req, res) => {
  try {
    if (Array.isArray(req.body.records)) {
      return exports.saveAttendanceBatch(req, res);
    }

    const {
      employeeId,
      shopId,
      date,
      shiftStart,
      shiftEnd,
      timeReached,
      workerEndTime,
      status = 'Present',
      remarks = ''
    } = req.body;

    const isAbsent = status === 'Absent';
    if (!employeeId || !date || (!isAbsent && !shopId)) {
      return res.status(400).json({
        success: false,
        message: isAbsent
          ? 'Employee ID and attendance date are required.'
          : 'Employee ID, shop ID, and attendance date are required.'
      });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    let shop = null;
    if (!isAbsent) {
      shop = await Shop.findById(shopId);
      if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });
      if (req.user.role === 'ATTENDANCE_OPERATOR' && (shop.status !== 'Active' || !shop.isActive)) {
        return res.status(400).json({ success: false, message: 'Attendance can only be entered for an active shop.' });
      }
    }
    if (employee.employmentStatus !== 'Active') {
      return res.status(400).json({ success: false, message: 'Attendance can only be entered for an active employee.' });
    }

    const dateString = getUKDateString(date);
    const attendanceDate = new Date(`${dateString}T12:00:00Z`);

    // Check lock
    const existing = await Attendance.findOne({ employee: employee._id, dateString });
    if (existing && ['Checked', 'Finalized'].includes(existing.approvalStatus)) {
      return res.status(403).json({
        success: false,
        message: `Attendance record for ${employee.name} on ${dateString} is locked (${existing.approvalStatus}) and cannot be edited by an operator.`
      });
    }

    // Historical wage snapshot: preserve existing non-zero daily wage if editing; use current employee wage if new or 0
    const dailyWage = (existing && existing.dailyWage > 0) ? existing.dailyWage : (employee.dailyWage || 50);
    const gracePeriod = await getGracePeriod();

    const start = isAbsent ? '' : (shiftStart || '09:00');
    const end = isAbsent ? '' : (shiftEnd || '19:00');
    const reached = isAbsent ? '' : (timeReached || start);
    const left = isAbsent ? '' : (workerEndTime || end);

    const calcResult = calculateAttendanceRecord({
      dailyWage,
      shiftStart: start,
      shiftEnd: end,
      timeReached: reached,
      workerEndTime: left,
      status,
      gracePeriodMinutes: gracePeriod
    });

    const recordData = {
      date: attendanceDate,
      dateString,
      employee: employee._id,
      employeeName: employee.name,
      employeeId: employee.employeeId,
      shop: shop ? shop._id : null,
      shopName: shop ? shop.name : 'Absent',
      shiftStart: start,
      shiftEnd: end,
      timeReached: reached,
      workerEndTime: left,
      scheduledHours: isAbsent ? 0 : calcResult.scheduledHours,
      actualHours: calcResult.actualHours,
      lateMinutes: calcResult.lateMinutes,
      status: calcResult.status,
      dailyWage,
      hourlyWage: calcResult.hourlyWage,
      lateDeduction: calcResult.lateDeduction,
      attendancePay: calcResult.attendancePay,
      remarks,
      approvalStatus: 'Pending Review',
      createdBy: req.user._id,
      createdByName: req.user.name
    };

    const record = await Attendance.findOneAndUpdate(
      { employee: employee._id, dateString },
      recordData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: existing ? 'ATTENDANCE_EDITED' : 'ATTENDANCE_CREATED',
      recordType: 'Attendance',
      recordId: record._id,
      details: `${existing ? 'Updated' : 'Created'} attendance for ${employee.name} (${shop ? shop.name : 'Absent'}) on ${dateString}: ${calcResult.status}`,
      req
    });

    return res.status(existing ? 200 : 201).json({
      success: true,
      message: `Attendance for ${employee.name} saved successfully.`,
      record: attendanceResponse(req, record)
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to save attendance.');
  }
};

/**
 * Usman / Attendance Operator saves attendance batch
 */
exports.saveAttendanceBatch = async (req, res) => {
  try {
    const { date, shopId, records } = req.body;
    if (!date || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Invalid payload: date and records array required.' });
    }

    const shopCache = new Map();
    const employeeIds = new Set();
    const preparedRecords = [];
    for (const item of records) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ success: false, message: 'Each attendance record must include an employee and their selected shop.' });
      }
      const employeeId = item.employeeId || item.employee;
      const isAbsent = item.status === 'Absent';
      const recordShopId = item.shopId;
      if (!employeeId || (!isAbsent && !recordShopId)) {
        return res.status(400).json({
          success: false,
          message: isAbsent
            ? 'Every attendance record must include an employee.'
            : 'Every attendance record must include an employee and the shop where they worked.'
        });
      }
      const employeeKey = employeeId.toString();
      if (employeeIds.has(employeeKey)) {
        return res.status(400).json({ success: false, message: 'Each employee can only appear once in an attendance batch.' });
      }
      employeeIds.add(employeeKey);

      const employee = await Employee.findById(employeeId);
      if (!employee) {
        return res.status(404).json({ success: false, message: `Employee ${employeeId} was not found.` });
      }
      if (employee.employmentStatus !== 'Active') {
        return res.status(400).json({ success: false, message: `Attendance can only be entered for active employee ${employee.name}.` });
      }

      let shop = null;
      if (!isAbsent && recordShopId) {
        const shopKey = recordShopId.toString();
        shop = shopCache.get(shopKey);
        if (!shop) {
          shop = await Shop.findById(recordShopId);
          if (!shop) return res.status(404).json({ success: false, message: `Shop ${recordShopId} was not found.` });
          if (req.user.role === 'ATTENDANCE_OPERATOR' && (shop.status !== 'Active' || !shop.isActive)) {
            return res.status(400).json({ success: false, message: `Attendance can only be entered for active shop ${shop.name}.` });
          }
          shopCache.set(shopKey, shop);
        }
      }
      preparedRecords.push({ item, employee, shop });
    }

    const dateString = getUKDateString(date);
    const attendanceDate = new Date(`${dateString}T12:00:00Z`);
    const gracePeriod = await getGracePeriod();

    const savedRecords = [];
    const lockedRecords = [];

    for (const { item, employee, shop } of preparedRecords) {

      // Check if locked
      const existing = await Attendance.findOne({ employee: employee._id, dateString });
      if (existing && ['Checked', 'Finalized'].includes(existing.approvalStatus)) {
        lockedRecords.push({ employeeName: employee.name, status: existing.approvalStatus });
        continue;
      }

      const isAbsent = item.status === 'Absent';
      // Preserve historical non-zero daily wage if existing; snapshot current if new or 0
      const dailyWage = (existing && existing.dailyWage > 0) ? existing.dailyWage : (employee.dailyWage || 50);
      const start = isAbsent ? '' : (item.shiftStart || '09:00');
      const end = isAbsent ? '' : (item.shiftEnd || '19:00');
      const reached = isAbsent ? '' : (item.timeReached || start);
      const left = isAbsent ? '' : (item.workerEndTime || end);

      // Calculate financials
      const calcResult = calculateAttendanceRecord({
        dailyWage,
        shiftStart: start,
        shiftEnd: end,
        timeReached: reached,
        workerEndTime: left,
        status: item.status || 'Present',
        gracePeriodMinutes: gracePeriod
      });

      const recordData = {
        date: attendanceDate,
        dateString,
        employee: employee._id,
        employeeName: employee.name,
        employeeId: employee.employeeId,
        shop: shop ? shop._id : null,
        shopName: shop ? shop.name : 'Absent',
        shiftStart: start,
        shiftEnd: end,
        timeReached: reached,
        workerEndTime: left,
        scheduledHours: isAbsent ? 0 : calcResult.scheduledHours,
        actualHours: calcResult.actualHours,
        lateMinutes: calcResult.lateMinutes,
        status: calcResult.status,
        dailyWage,
        hourlyWage: calcResult.hourlyWage,
        lateDeduction: calcResult.lateDeduction,
        attendancePay: calcResult.attendancePay,
        remarks: item.remarks || '',
        approvalStatus: 'Pending Review',
        createdBy: req.user._id,
        createdByName: req.user.name
      };

      const doc = await Attendance.findOneAndUpdate(
        { employee: employee._id, dateString },
        recordData,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      savedRecords.push(doc);
      await logAction({
        user: req.user._id,
        username: req.user.name,
        role: req.user.role,
        action: existing ? 'ATTENDANCE_EDITED' : 'ATTENDANCE_CREATED',
        recordType: 'Attendance',
        recordId: doc._id,
        details: `${existing ? 'Updated' : 'Created'} attendance for ${employee.name} (${shop ? shop.name : 'Absent'}) on ${dateString}: ${calcResult.status}`,
        req
      });
    }

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'ATTENDANCE_BATCH_SAVED',
      details: `Saved ${savedRecords.length} attendance records across ${shopCache.size} shop${shopCache.size === 1 ? '' : 's'} on ${dateString}`,
      req
    });

    const absentCount = savedRecords.filter(record => record.status === 'Absent').length;
    res.json({
      success: true,
      message: `Saved ${savedRecords.length} attendance records successfully (${shopCache.size} shop${shopCache.size === 1 ? '' : 's'}; ${absentCount} absent).`,
      count: savedRecords.length,
      records: savedRecords.map(record => attendanceResponse(req, record)),
      lockedCount: lockedRecords.length,
      lockedRecords
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to save attendance batch.');
  }
};

/**
 * Get attendance record by ID
 */
exports.getAttendanceById = async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id)
      .populate('employee')
      .populate('shop');
    if (!record) return res.status(404).json({ success: false, message: 'Attendance record not found.' });
    res.json({ success: true, record: attendanceResponse(req, record) });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch attendance record.');
  }
};

/**
 * Get all attendance records with flexible filtering
 */
exports.getAllAttendance = async (req, res) => {
  try {
    const { date, dateString, startDate, endDate, shop, shopId, employee, employeeId, approvalStatus, status } = req.query;
    const query = {};

    if (dateString) {
      query.dateString = dateString;
    } else if (date) {
      query.dateString = getUKDateString(date);
    } else if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const targetShop = shopId || shop;
    if (targetShop) query.shop = targetShop;

    const targetEmployee = employeeId || employee;
    if (targetEmployee) query.employee = targetEmployee;

    if (approvalStatus) query.approvalStatus = approvalStatus;
    if (status) query.status = status;

    const records = await Attendance.find(query)
      .populate('employee')
      .populate('shop')
      .sort({ date: -1, employeeName: 1 });

    res.json({
      success: true,
      count: records.length,
      records: records.map(record => attendanceResponse(req, record))
    });
  } catch (error) {
    return sendServerError(res, error, 'Error fetching attendance history.');
  }
};

/**
 * Sarfraz / Checker retrieves attendance records for review
 */
exports.getPendingAttendance = async (req, res) => {
  try {
    const { date, shopId, status, approvalStatus, search } = req.query;
    const query = {};

    if (approvalStatus && approvalStatus !== 'All') {
      query.approvalStatus = approvalStatus;
    } else if (!approvalStatus) {
      query.approvalStatus = 'Pending Review';
    }

    if (date) {
      query.dateString = getUKDateString(date);
    }
    if (shopId) query.shop = shopId;
    if (status && status !== 'All') query.status = status;
    if (search) {
      query.$or = [
        { employeeName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const records = await Attendance.find(query)
      .populate('employee')
      .populate('shop')
      .sort({ date: -1, shopName: 1, employeeName: 1 });

    res.json({
      success: true,
      count: records.length,
      records: records.map(record => attendanceResponse(req, record))
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving pending attendance.');
  }
};

/**
 * Operator (while draft/pending), Checker, or Admin updates a specific attendance record
 */
exports.updateAttendanceRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await Attendance.findById(id);
    if (!record) return res.status(404).json({ success: false, message: 'Attendance record not found.' });

    // Strict locking rule for Finalized
    if (record.approvalStatus === 'Finalized' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Finalized attendance records cannot be modified.' });
    }

    // Strict locking rule for Checked records: only ADMIN can modify
    if (record.approvalStatus === 'Checked' && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'This attendance record has already been checked and locked. Only an Administrator can modify checked records.'
      });
    }
    if (req.user.role === 'ATTENDANCE_OPERATOR' && record.approvalStatus !== 'Pending Review' && record.approvalStatus !== 'Draft') {
      return res.status(403).json({ success: false, message: 'Only pending attendance can be edited by an operator.' });
    }

    // Strict locking rule for Operator
    if (['Checked', 'Finalized'].includes(record.approvalStatus) && req.user.role === 'ATTENDANCE_OPERATOR') {
      return res.status(403).json({
        success: false,
        message: `Attendance is ${record.approvalStatus} by Checker/Admin and is locked from operator modification.`
      });
    }

    const {
      shiftStart = record.shiftStart,
      shiftEnd = record.shiftEnd,
      timeReached = record.timeReached,
      workerEndTime = record.workerEndTime,
      status = record.status,
      remarks = record.remarks
    } = req.body;

    const gracePeriod = await getGracePeriod();
    const calcResult = calculateAttendanceRecord({
      dailyWage: record.dailyWage,
      shiftStart,
      shiftEnd,
      timeReached,
      workerEndTime,
      status,
      gracePeriodMinutes: gracePeriod
    });

    record.shiftStart = shiftStart;
    record.shiftEnd = shiftEnd;
    record.timeReached = timeReached;
    record.workerEndTime = workerEndTime;
    record.scheduledHours = calcResult.scheduledHours;
    record.actualHours = calcResult.actualHours;
    record.lateMinutes = calcResult.lateMinutes;
    record.status = calcResult.status;
    record.hourlyWage = calcResult.hourlyWage;
    record.lateDeduction = calcResult.lateDeduction;
    record.attendancePay = calcResult.attendancePay;
    record.remarks = remarks;

    await record.save();

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'ATTENDANCE_EDITED',
      recordType: 'Attendance',
      recordId: record._id,
      details: `Edited attendance for ${record.employeeName} on ${record.dateString}: late ${record.lateMinutes}m, deduction £${record.lateDeduction}`,
      req
    });

    res.json({ success: true, message: 'Attendance updated successfully.', record: attendanceResponse(req, record) });
  } catch (error) {
    return sendServerError(res, error, 'Failed to update attendance.');
  }
};

/**
 * Sarfraz / Checker approves attendance (single or batch)
 */
exports.approveAttendance = async (req, res) => {
  try {
    const { ids } = req.body;
    const idList = Array.isArray(ids) ? ids : [ids || req.params.id];

    if (!idList.length || !idList[0]) {
      return res.status(400).json({ success: false, message: 'No attendance IDs provided for approval.' });
    }

    const pendingRecords = await Attendance.find({
      _id: { $in: idList },
      approvalStatus: { $in: ['Pending Review', 'Draft', 'Saved'] }
    }).select('_id employeeName employeeId shopName dateString');
    const updated = await Attendance.updateMany(
      { _id: { $in: pendingRecords.map(record => record._id) } },
      {
        $set: {
          approvalStatus: 'Checked',
          checkedBy: req.user._id,
          checkedByName: req.user.name,
          checkedAt: new Date()
        }
      }
    );

    await Promise.all(pendingRecords.map(record => logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'ATTENDANCE_CHECKED',
      recordType: 'Attendance',
      recordId: record._id,
      details: `Checked attendance for ${record.employeeName} (${record.shopName}) on ${record.dateString}`,
      req
    })));

    res.json({
      success: true,
      message: `Successfully approved ${updated.modifiedCount} attendance records.`,
      modifiedCount: updated.modifiedCount
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to approve attendance.');
  }
};
