const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const Shop = require('../src/models/Shop');
const ShopSchedule = require('../src/models/ShopSchedule');
const Attendance = require('../src/models/Attendance');
const WeeklySalary = require('../src/models/WeeklySalary');
const Employee = require('../src/models/Employee');
const LedgerTransaction = require('../src/models/LedgerTransaction');
const { calculateAttendanceRecord, calculateScheduledHours } = require('../src/utils/calc');
const { recalculateEmployeeLedger } = require('../src/utils/ledgerHelper');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // 1. Find Edgware Shop
  const edgware = await Shop.findOne({ name: { $regex: 'edgware', $options: 'i' } });
  if (!edgware) {
    throw new Error('Edgware shop not found!');
  }
  console.log(`Found Edgware Shop: ID=${edgware._id}, Name=${edgware.name}`);

  // 2. Setup 7 days of schedule for Edgware
  // Sunday: 11:00 AM – 6:30 PM (7.5 hrs)
  // Monday - Saturday: 9:30 AM – 6:30 PM (9.0 hrs)
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (let day = 0; day <= 6; day++) {
    const isSunday = (day === 0);
    const openingTime = isSunday ? '11:00' : '09:30';
    const closingTime = '18:30';
    const defaultHours = calculateScheduledHours(openingTime, closingTime);

    const sched = await ShopSchedule.findOneAndUpdate(
      { shop: edgware._id, dayOfWeek: day },
      {
        shop: edgware._id,
        dayOfWeek: day,
        dayName: DAY_NAMES[day],
        openingTime,
        closingTime,
        defaultHours,
        isActive: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Upserted Edgware schedule: ${sched.dayName} (${day}) -> ${sched.openingTime} to ${sched.closingTime} (${defaultHours}h)`);
  }

  // 3. Find Wali
  const wali = await Employee.findOne({ name: { $regex: 'wali', $options: 'i' } });
  if (!wali) {
    console.log('Wali employee not found.');
  } else {
    console.log(`Found Wali: ID=${wali._id}, Name=${wali.name}, DailyWage=${wali.dailyWage}`);

    // Update Wali's attendance records for Edgware in week 11/10/2026 - 17/10/2026 and current week
    const targetDates = [
      '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14',
      '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'
    ];

    const waliAtts = await Attendance.find({
      employee: wali._id,
      dateString: { $in: targetDates }
    });

    console.log(`Found ${waliAtts.length} attendance records for Wali to adjust.`);

    for (const att of waliAtts) {
      const isSunday = (att.dateString === '2026-10-11' || att.dateString === '2026-10-18');
      const correctShiftStart = isSunday ? '11:00' : '09:30';
      const correctShiftEnd = '18:30';

      const oldStatus = att.status;
      const oldLate = att.lateMinutes;
      const oldDed = att.lateDeduction;

      att.shiftStart = correctShiftStart;
      att.shiftEnd = correctShiftEnd;
      // If worker worked till old scheduled end (17:00 or 18:00 or 19:00), update workerEndTime to closing time so no false early leave deduction
      if (!att.workerEndTime || ['17:00', '18:00', '19:00'].includes(att.workerEndTime)) {
        att.workerEndTime = correctShiftEnd;
      }

      const calc = calculateAttendanceRecord({
        dailyWage: att.dailyWage || wali.dailyWage || 90,
        shiftStart: correctShiftStart,
        shiftEnd: correctShiftEnd,
        timeReached: att.timeReached || correctShiftStart,
        workerEndTime: att.workerEndTime || correctShiftEnd,
        status: att.status === 'Absent' ? 'Absent' : 'Present',
        gracePeriodMinutes: 15
      });

      att.scheduledHours = calc.scheduledHours;
      att.actualHours = calc.actualHours;
      att.lateMinutes = calc.lateMinutes;
      att.lateDeduction = calc.lateDeduction;
      att.attendancePay = calc.attendancePay;
      att.status = calc.status;

      await att.save();
      console.log(`Updated Wali ${att.dateString}: Shift ${correctShiftStart}-${correctShiftEnd}, Reached ${att.timeReached}, OldLate: ${oldLate}m (ded £${oldDed}) -> NewLate: ${calc.lateMinutes}m (ded £${calc.lateDeduction}), Pay £${calc.attendancePay}`);
    }

    // 4. Update Wali's WeeklySalary for 11/10/2026 – 17/10/2026
    const salary = await WeeklySalary.findOne({
      employee: wali._id,
      weekStartDateString: '2026-10-11'
    });

    if (salary) {
      console.log(`Found Wali WeeklySalary: ID=${salary._id}, Week=${salary.weekLabel}, Status=${salary.status}`);

      // Rebuild attendance breakdown
      const weekAtts = await Attendance.find({
        employee: wali._id,
        dateString: { $gte: '2026-10-11', $lte: '2026-10-17' }
      }).sort({ dateString: 1 });

      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      salary.attendanceBreakdown = weekAtts.map(r => {
        const d = new Date(`${r.dateString}T12:00:00Z`);
        const dayNum = d.getUTCDay();
        return {
          attendanceId: r._id,
          dateString: r.dateString,
          dayOfWeek: DAY_NAMES[dayNum] || `Day ${dayNum}`,
          shopName: r.shopName || 'Edgware',
          shiftStart: r.shiftStart,
          shiftEnd: r.shiftEnd,
          timeReached: r.timeReached,
          workerEndTime: r.workerEndTime,
          scheduledHours: r.scheduledHours,
          actualHours: r.actualHours,
          status: r.status,
          dailyWage: r.dailyWage,
          lateMinutes: r.lateMinutes,
          lateDeduction: r.lateDeduction,
          attendancePay: r.attendancePay,
          remarks: r.remarks || ''
        };
      });

      const totalGross = weekAtts.reduce((sum, r) => sum + (r.dailyWage || 0), 0);
      const totalLateDed = weekAtts.reduce((sum, r) => sum + (r.lateDeduction || 0), 0);
      const totalNetAtt = weekAtts.reduce((sum, r) => sum + (r.attendancePay || 0), 0);

      salary.grossDailyWages = Number(totalGross.toFixed(2));
      salary.lateDeductions = Number(totalLateDed.toFixed(2));
      salary.netAttendancePay = Number(totalNetAtt.toFixed(2));
      salary.finalSalary = Number(totalNetAtt.toFixed(2));
      salary.balanceRemaining = Number(Math.max(0, salary.finalSalary - (salary.totalPaid || 0)).toFixed(2));

      if (salary.finalizationSnapshot) {
        salary.finalizationSnapshot.attendanceBreakdown = salary.attendanceBreakdown;
        salary.finalizationSnapshot.lateDeductions = salary.lateDeductions;
        salary.finalizationSnapshot.netAttendancePay = salary.netAttendancePay;
        salary.finalizationSnapshot.finalSalary = salary.finalSalary;
        salary.finalizationSnapshot.updatedAt = new Date();
        salary.markModified('finalizationSnapshot');
      }

      await salary.save();
      console.log(`Saved updated WeeklySalary for Wali: Gross £${salary.grossDailyWages}, LateDed £${salary.lateDeductions}, NetAtt £${salary.netAttendancePay}, Final £${salary.finalSalary}`);

      // Sync Ledger Transaction
      await LedgerTransaction.findOneAndUpdate(
        {
          employee: wali._id,
          transactionType: 'SALARY_EARNED',
          referenceId: salary._id
        },
        {
          employee: wali._id,
          date: salary.weekEndDate,
          description: `Weekly Salary for week ${salary.weekLabel} (${salary.shopName})`,
          referenceType: 'WeeklySalary',
          referenceId: salary._id,
          attendancePay: salary.netAttendancePay,
          lateDeduction: salary.lateDeductions,
          allowance: 0,
          bonus: 0,
          otherDeduction: 0,
          amountEarned: salary.finalSalary,
          amountPaid: 0
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await recalculateEmployeeLedger(wali._id);
      console.log('Employee ledger recalculated successfully for Wali.');
    }
  }

  await mongoose.disconnect();
  console.log('Completed successfully.');
}

run().catch(console.error);
