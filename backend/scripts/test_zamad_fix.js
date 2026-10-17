const mongoose = require('mongoose');
require('dotenv').config();

const { calculateAttendanceRecord, resolveDailyWage } = require('../src/utils/calc');

// New logic
function newCalculateAttendanceRecord({
  dailyWage,
  shiftStart = '09:00',
  shiftEnd = '19:00',
  timeReached = '09:00',
  workerEndTime = '19:00',
  status = 'Present',
  gracePeriodMinutes = 15,
}) {
  const { calculateScheduledHours, calculateWorkedHours, calculateLateMinutes, calculateEarlyLeaveMinutes } = require('../src/utils/calc');
  const wage = (dailyWage !== undefined && dailyWage !== null && dailyWage !== '' && !isNaN(Number(dailyWage)))
    ? Math.max(0, Number(dailyWage))
    : 50;
  const scheduledHours = calculateScheduledHours(shiftStart, shiftEnd);
  const hourlyWage = (scheduledHours > 0 && wage > 0) ? Number((wage / scheduledHours).toFixed(4)) : 0;

  if (status === 'Absent' || wage === 0) {
    const actualHours = (status === 'Absent') ? 0 : calculateWorkedHours(timeReached, workerEndTime, scheduledHours, status);
    const lateMinutes = (status === 'Absent') ? 0 : calculateLateMinutes(shiftStart, timeReached);
    const earlyLeaveMinutes = (status === 'Absent') ? 0 : calculateEarlyLeaveMinutes(shiftEnd, workerEndTime);
    let computedStatus = status;
    if (status !== 'Absent') {
      if (!status || status === 'Present' || status === 'Late') {
        computedStatus = lateMinutes > gracePeriodMinutes ? 'Late' : 'Present';
      }
    }
    return {
      scheduledHours,
      actualHours,
      lateMinutes,
      earlyLeaveMinutes,
      hourlyWage: 0,
      lateDeduction: 0,
      arrivalDeduction: 0,
      earlyLeaveDeduction: 0,
      attendancePay: 0,
      status: computedStatus || 'Present'
    };
  }

  const lateMinutes = calculateLateMinutes(shiftStart, timeReached);
  const earlyLeaveMinutes = calculateEarlyLeaveMinutes(shiftEnd, workerEndTime);

  let computedStatus = status;
  if (!status || status === 'Present' || status === 'Late') {
    computedStatus = lateMinutes > gracePeriodMinutes ? 'Late' : 'Present';
  }

  let arrivalDeduction = 0;
  if (lateMinutes > gracePeriodMinutes && hourlyWage > 0) {
    arrivalDeduction = Number((hourlyWage * (lateMinutes / 60)).toFixed(2));
  }

  let earlyLeaveDeduction = 0;
  if (earlyLeaveMinutes > 0 && computedStatus !== 'Half') {
    earlyLeaveDeduction = Number((hourlyWage * (earlyLeaveMinutes / 60)).toFixed(2));
  }

  const totalDeduction = Number((arrivalDeduction + earlyLeaveDeduction).toFixed(2));

  let attendancePay = 0;
  let finalLateDeduction = totalDeduction;

  if (computedStatus === 'Half') {
    const halfDayWage = Number((wage / 2).toFixed(2));
    if (totalDeduction >= halfDayWage) {
      attendancePay = Number(Math.max(0, wage - totalDeduction).toFixed(2));
      finalLateDeduction = totalDeduction;
    } else {
      attendancePay = Number(Math.max(0, halfDayWage - totalDeduction).toFixed(2));
      finalLateDeduction = Number(Math.max(0, wage - attendancePay).toFixed(2));
    }
  } else {
    attendancePay = Number(Math.max(0, wage - totalDeduction).toFixed(2));
    finalLateDeduction = totalDeduction;
  }

  const actualHours = calculateWorkedHours(timeReached, workerEndTime, scheduledHours, computedStatus);

  return {
    scheduledHours,
    actualHours,
    lateMinutes,
    earlyLeaveMinutes,
    hourlyWage: Number(hourlyWage.toFixed(2)),
    lateDeduction: finalLateDeduction,
    arrivalDeduction,
    earlyLeaveDeduction,
    attendancePay,
    status: computedStatus
  };
}

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rota_system';
  await mongoose.connect(uri);
  const Attendance = require('../src/models/Attendance');
  const Employee = require('../src/models/Employee');

  const zamad = await Employee.findOne({ name: { $regex: 'Zamad', $options: 'i' } });
  const atts = await Attendance.find({
    employee: zamad._id,
    dateString: { $gte: '2026-10-11', $lte: '2026-10-17' }
  }).sort({ dateString: 1 }).lean();

  console.log('Testing Zamad records with new logic:');
  let totalGross = 0;
  let totalLate = 0;
  let totalPay = 0;

  for (const a of atts) {
    const res = newCalculateAttendanceRecord({
      dailyWage: a.dailyWage || 70,
      shiftStart: a.shiftStart,
      shiftEnd: a.shiftEnd,
      timeReached: a.timeReached,
      workerEndTime: a.workerEndTime,
      status: a.status,
      gracePeriodMinutes: 15
    });
    totalGross += (a.dailyWage || 70);
    totalLate += res.lateDeduction;
    totalPay += res.attendancePay;

    console.log(`  Date: ${a.dateString} Status: ${a.status} Wage: ${a.dailyWage} LateDed: ${res.lateDeduction} AttPay: ${res.attendancePay}`);
  }

  console.log('TOTALS:');
  console.log('  Gross Wages:', totalGross.toFixed(2));
  console.log('  Late Deductions:', totalLate.toFixed(2));
  console.log('  Net Attendance Pay:', totalPay.toFixed(2));
  console.log('  Expected Net (Gross - Late):', (totalGross - totalLate).toFixed(2));

  await mongoose.disconnect();
}
run().catch(console.error);
