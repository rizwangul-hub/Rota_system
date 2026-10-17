const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rota_system';
  await mongoose.connect(uri);
  const WeeklySalary = require('../src/models/WeeklySalary');
  const Attendance = require('../src/models/Attendance');
  const Employee = require('../src/models/Employee');

  const zamad = await Employee.findOne({ name: { $regex: 'Zamad', $options: 'i' } });
  console.log('Employee:', zamad ? { name: zamad.name, id: zamad._id, dailyWage: zamad.dailyWage } : 'Not found');

  if (zamad) {
    const salaries = await WeeklySalary.find({ employee: zamad._id }).lean();
    console.log('Salaries count:', salaries.length);
    for (const s of salaries) {
      console.log('Salary:', {
        weekLabel: s.weekLabel,
        grossDailyWages: s.grossDailyWages,
        lateDeductions: s.lateDeductions,
        netAttendancePay: s.netAttendancePay,
        finalSalary: s.finalSalary,
        status: s.status,
        attendanceBreakdownCount: s.attendanceBreakdown?.length
      });
      if (s.attendanceBreakdown) {
        console.log('Breakdown items:');
        s.attendanceBreakdown.forEach(b => {
          console.log('  Date:', b.dateString, 'Status:', b.status, 'DailyWage:', b.dailyWage, 'LateMin:', b.lateMinutes, 'LateDed:', b.lateDeduction, 'AttPay:', b.attendancePay);
        });
      }
    }

    const atts = await Attendance.find({ employee: zamad._id }).sort({ dateString: -1 }).limit(10).lean();
    console.log('Recent Attendances:');
    atts.forEach(a => {
      console.log('  Att:', a.dateString, 'Status:', a.status, 'DailyWage:', a.dailyWage, 'Shift:', a.shiftStart, '-', a.shiftEnd, 'Reached:', a.timeReached, '-', a.workerEndTime, 'LateMin:', a.lateMinutes, 'LateDed:', a.lateDeduction, 'AttPay:', a.attendancePay, 'Approval:', a.approvalStatus);
    });
  }
  await mongoose.disconnect();
}
run().catch(console.error);
