const WeeklyRota = require('../models/WeeklyRota');
const Shop = require('../models/Shop');
const { getWeekRange, getUKDateString, formatUKDate } = require('../utils/calc');
const { logAction } = require('../utils/audit');
const { sendServerError } = require('../utils/httpErrors');

function id(val) {
  return String(val?._id || val || '');
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Helper to build 7 days array given a Sunday start date YYYY-MM-DD
 */
function buildEmptyDays(sundayStr) {
  const [y, m, d] = sundayStr.split('-').map(Number);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const curDate = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0));
    const dateKey = curDate.toISOString().slice(0, 10);
    days.push({
      dateKey,
      dayIndex: i,
      dayOfWeek: DAY_NAMES[i],
      formattedDate: formatUKDate(dateKey),
      isDayOff: true,
      label: 'Day Off',
      shifts: []
    });
  }
  return days;
}

/**
 * GET /api/worker/rota
 * Retrieves the authenticated worker's published weekly schedule.
 * Strictly filters:
 * - status === 'PUBLISHED'
 * - assignments matching authenticated employeeId ONLY
 * - zero exposure of other staff or draft rotas
 */
exports.getWeeklyRota = async (req, res) => {
  try {
    const employee = req.employee;
    const employeeId = employee._id;
    const { weekStart } = req.query;

    const todayStr = getUKDateString();
    const currentWeekRange = getWeekRange(todayStr);

    let targetRange;
    if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart.trim())) {
      targetRange = getWeekRange(weekStart.trim());
    } else {
      targetRange = currentWeekRange;
    }

    const { startDateString, endDateString, weekLabel } = targetRange;

    // Calculate Previous and Next week start dates
    const [y, m, d] = startDateString.split('-').map(Number);
    const prevDate = new Date(Date.UTC(y, m - 1, d - 7, 12, 0, 0));
    const nextDate = new Date(Date.UTC(y, m - 1, d + 7, 12, 0, 0));
    const prevWeekStart = prevDate.toISOString().slice(0, 10);
    const nextWeekStart = nextDate.toISOString().slice(0, 10);

    // Fetch published rota
    const rota = await WeeklyRota.findOne({
      weekStart: startDateString,
      status: 'PUBLISHED'
    }).populate('assignments.shopId', 'name code address phone');

    // Fetch available published weeks for quick navigation picker
    const publishedWeeks = await WeeklyRota.find({ status: 'PUBLISHED' })
      .select('weekStart weekEnd publishedAt')
      .sort({ weekStart: -1 })
      .limit(16)
      .lean();

    const availableWeeks = publishedWeeks.map(w => ({
      weekStart: w.weekStart,
      weekEnd: w.weekEnd,
      label: getWeekRange(w.weekStart).weekLabel,
      isCurrent: w.weekStart === currentWeekRange.startDateString
    }));

    // If rota is not published or does not exist
    if (!rota) {
      return res.json({
        success: true,
        published: false,
        weekStart: startDateString,
        weekEnd: endDateString,
        weekLabel,
        prevWeekStart,
        nextWeekStart,
        isCurrentWeek: startDateString === currentWeekRange.startDateString,
        availableWeeks,
        summary: {
          totalShifts: 0,
          totalHours: 0,
          workingDays: 0,
          daysOff: 7,
          shopsCount: 0,
          shopNames: []
        },
        acknowledgement: {
          status: 'NO_ROTA_PUBLISHED',
          isAcknowledged: false,
          hasChanged: false,
          acknowledgedAt: null
        },
        days: buildEmptyDays(startDateString)
      });
    }

    // Process published assignments for this worker
    const workerAssignments = (rota.assignments || []).filter(
      a => id(a.employeeId) === id(employeeId)
    );

    // Build 7-day schedule
    const days = buildEmptyDays(startDateString);
    const assignedShopsMap = new Map();
    let totalScheduledHours = 0;
    let shiftsCount = 0;

    workerAssignments.forEach(assignment => {
      const day = days.find(d => d.dateKey === assignment.dateKey);
      if (day) {
        const shopObj = assignment.shopId;
        const shopName = shopObj?.name || 'Assigned Branch';
        const shopCode = shopObj?.code || '';
        const shopAddress = shopObj?.address || '';
        const shopPhone = shopObj?.phone || '';

        assignedShopsMap.set(id(shopObj?._id || assignment.shopId), shopName);

        const hours = Number(assignment.scheduledHours || 0);
        totalScheduledHours += hours;
        shiftsCount++;

        day.isDayOff = false;
        day.shifts.push({
          id: assignment._id,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          scheduledHours: hours,
          shopId: id(shopObj?._id || assignment.shopId),
          shopName,
          shopCode,
          shopAddress,
          shopPhone,
          status: assignment.status || 'AVAILABLE',
          note: assignment.note || ''
        });
      }
    });

    const workingDays = days.filter(d => !d.isDayOff && d.shifts.length > 0).length;
    const daysOff = 7 - workingDays;
    const shopNames = Array.from(assignedShopsMap.values());

    // Determine Acknowledgement Status & Rota Version Change
    const currentVersion = rota.publishedVersions?.length || 1;
    const ack = (rota.acknowledgements || []).find(a => id(a.employeeId) === id(employeeId));

    let ackStatus = 'PENDING_ACKNOWLEDGEMENT';
    let isAcknowledged = false;
    let hasChanged = false;
    let acknowledgedAt = null;

    if (ack) {
      acknowledgedAt = ack.acknowledgedAt;
      const lastPublishedAtTime = rota.publishedAt ? new Date(rota.publishedAt).getTime() : 0;
      const ackPublishedAtTime = ack.publishedAtAcknowledged ? new Date(ack.publishedAtAcknowledged).getTime() : 0;
      const ackVersion = ack.publishedVersionAcknowledged || 1;

      // Detect if rota was updated/republished after the worker acknowledged
      const hasRepublished = (lastPublishedAtTime > 0 && ackPublishedAtTime > 0 && lastPublishedAtTime > ackPublishedAtTime + 2000);
      if (ackVersion < currentVersion || hasRepublished) {
        ackStatus = 'UPDATE_REQUIRED';
        isAcknowledged = false;
        hasChanged = true;
      } else {
        ackStatus = 'ACKNOWLEDGED';
        isAcknowledged = true;
        hasChanged = false;
      }
    }

    return res.json({
      success: true,
      published: true,
      rotaId: rota._id,
      weekStart: startDateString,
      weekEnd: endDateString,
      weekLabel,
      publishedAt: rota.publishedAt,
      publishedVersion: currentVersion,
      prevWeekStart,
      nextWeekStart,
      isCurrentWeek: startDateString === currentWeekRange.startDateString,
      availableWeeks,
      summary: {
        totalShifts: shiftsCount,
        totalHours: Number(totalScheduledHours.toFixed(2)),
        workingDays,
        daysOff,
        shopsCount: assignedShopsMap.size,
        shopNames
      },
      acknowledgement: {
        status: ackStatus,
        isAcknowledged,
        hasChanged,
        acknowledgedAt,
        publishedVersionAcknowledged: ack?.publishedVersionAcknowledged || null,
        lastPublishedAt: rota.publishedAt
      },
      days
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving weekly rota.');
  }
};

/**
 * POST /api/worker/rota/acknowledge
 * Worker confirms / acknowledges their published weekly rota.
 * - Confirms the worker has seen their published schedule.
 * - Stores published version & timestamp to detect future changes.
 * - Workers CANNOT edit or modify the rota.
 */
exports.acknowledgeWeeklyRota = async (req, res) => {
  try {
    const employee = req.employee;
    const employeeId = employee._id;
    const { rotaId, weekStart, notes } = req.body;

    const query = { status: 'PUBLISHED' };
    if (rotaId) {
      query._id = rotaId;
    } else if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart.trim())) {
      const range = getWeekRange(weekStart.trim());
      query.weekStart = range.startDateString;
    } else {
      return res.status(400).json({
        success: false,
        message: 'A valid rota ID or weekStart (YYYY-MM-DD) is required.'
      });
    }

    const rota = await WeeklyRota.findOne(query);
    if (!rota) {
      return res.status(404).json({
        success: false,
        message: 'Published weekly rota not found for acknowledgement.'
      });
    }

    const currentVersion = rota.publishedVersions?.length || 1;
    const now = new Date();

    const ackRecord = {
      employeeId,
      workerUserId: req.user._id,
      acknowledgedAt: now,
      publishedVersionAcknowledged: currentVersion,
      publishedAtAcknowledged: rota.publishedAt || now,
      notes: notes ? String(notes).trim().slice(0, 300) : ''
    };

    // Atomically update acknowledgement (prevents version conflicts and duplicate records)
    await WeeklyRota.updateOne(
      { _id: rota._id },
      { $pull: { acknowledgements: { employeeId } } }
    );
    await WeeklyRota.updateOne(
      { _id: rota._id },
      { $push: { acknowledgements: ackRecord } }
    );

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: 'WORKER',
      action: 'WORKER_ACKNOWLEDGE_ROTA',
      recordType: 'WeeklyRota',
      recordId: rota._id,
      details: `Worker ${employee.name} acknowledged published rota for week ${rota.weekStart} (version ${currentVersion}).`,
      req
    });

    return res.json({
      success: true,
      message: 'Weekly rota confirmed and acknowledged.',
      acknowledgement: {
        status: 'ACKNOWLEDGED',
        isAcknowledged: true,
        hasChanged: false,
        acknowledgedAt: now,
        publishedVersionAcknowledged: currentVersion
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error acknowledging weekly rota.');
  }
};
