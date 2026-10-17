const mongoose = require('mongoose');
require('dotenv').config();

const { calculateAttendanceRecord, resolveDailyWage } = require('../src/utils/calc');

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rota_system';
  await mongoose.connect(uri);

  const WeeklySalary = require('../src/models/WeeklySalary');
  const Attendance = require('../src/models/Attendance');
  const Employee = require('../src/models/Employee');

  console.log('--- RECALCULATING ATTENDANCE & NON-FINALIZED WEEKLY SALARIES ---');

  // 1. Recalculate attendance records from 11 October 2026 onwards
  const attendances = await Attendance.find({
    dateString: { $gte: '2026-10-11' }
  }).populate('employee');

  console.log(`Found ${attendances.length} attendance records to refresh.`);
  for (const a of attendances) {
    if (a.status === 'Absent' || (a.employee && a.employee.dailyWage === 0)) {
      continue;
    }
    const empDailyWage = a.employee ? a.employee.dailyWage : undefined;
    const wage = resolveDailyWage(a.dailyWage, empDailyWage);
    const calc = calculateAttendanceRecord({
      dailyWage: wage,
      shiftStart: a.shiftStart || '09:00',
      shiftEnd: a.shiftEnd || '19:00',
      timeReached: a.timeReached || a.shiftStart || '09:00',
      workerEndTime: a.workerEndTime || a.shiftEnd || '19:00',
      status: a.status,
      gracePeriodMinutes: 15
    });

    await Attendance.updateOne(
      { _id: a._id },
      {
        $set: {
          scheduledHours: calc.scheduledHours,
          actualHours: calc.actualHours,
          hourlyWage: calc.hourlyWage,
          lateMinutes: calc.lateMinutes,
          lateDeduction: calc.lateDeduction,
          attendancePay: calc.attendancePay,
          dailyWage: wage
        }
      }
    );
  }
  console.log('Attendance records refreshed.');

  // 2. Recompute weekly salaries
  const salaries = await WeeklySalary.find({
    status: { $in: ['Generated', 'Draft', 'Pending'] }
  }).populate('employee');

  console.log(`Found ${salaries.length} non-finalized weekly salaries to recalculate.`);

  for (const s of salaries) {
    // Find all attendance records for this weekly salary or this employee/week
    const atts = await Attendance.find({
      employee: s.employee?._id || s.employee,
      dateString: { $gte: s.weekStartDateString, $lte: s.weekEndDateString },
      approvalStatus: { $in: ['Checked', 'Finalized'] }
    }).sort({ dateString: 1 });

    if (!atts.length) continue;

    const workingDays = atts.filter(r => r.status !== 'Absent').length;
    const scheduledHours = Number(atts.reduce((sum, r) => sum + (Number(r.scheduledHours) || 0), 0).toFixed(2));
    const actualHours = Number(atts.reduce((sum, r) => sum + (Number(r.actualHours) || 0), 0).toFixed(2));
    const grossDailyWages = Number(atts.reduce((sum, r) => sum + (Number(r.dailyWage) || 0), 0).toFixed(2));
    const lateDeductions = Number(atts.reduce((sum, r) => sum + (Number(r.lateDeduction) || 0), 0).toFixed(2));
    const netAttendancePay = Number(atts.reduce((sum, r) => sum + (Number(r.attendancePay) || 0), 0).toFixed(2));

    const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const { getDayOfWeekUK } = require('../src/utils/calc');

    const breakdown = atts.map(r => {
      const dayNum = getDayOfWeekUK(r.dateString);
      return {
        attendanceId: r._id,
        dateString: r.dateString,
        dayOfWeek: DAY_NAMES[dayNum] || `Day ${dayNum}`,
        shopName: r.shopName || 'Shop',
        shiftStart: r.shiftStart,
        shiftEnd: r.shiftEnd,
        timeReached: r.timeReached,
        workerEndTime: r.workerEndTime,
        scheduledHours: r.scheduledHours || 0,
        actualHours: r.actualHours || 0,
        status: r.status,
        dailyWage: r.dailyWage != null ? r.dailyWage : 0,
        lateMinutes: r.lateMinutes || 0,
        lateDeduction: r.lateDeduction || 0,
        attendancePay: r.attendancePay || 0,
        remarks: r.remarks || ''
      };
    });

    s.workingDays = workingDays;
    s.scheduledHours = scheduledHours;
    s.actualHours = actualHours;
    s.grossDailyWages = grossDailyWages;
    s.lateDeductions = lateDeductions;
    s.netAttendancePay = netAttendancePay;
    s.finalSalary = netAttendancePay + (s.travelAllowance || 0) + (s.otherAllowances || 0) + (s.bonus || 0) - (s.manualDeductions || 0);
    s.balanceRemaining = Math.max(0, s.finalSalary - (s.totalPaid || 0));
    s.attendanceBreakdown = breakdown;

    await s.save();

    console.log(`Recalculated salary for ${s.employeeName}: Gross: £${grossDailyWages}, LateDed: £${lateDeductions}, NetAttPay: £${netAttendancePay}, Final: £${s.finalSalary}`);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
