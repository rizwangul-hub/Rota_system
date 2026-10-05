const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://rizwan:mern@cluster0.j431naq.mongodb.net/rota-system';
require('./src/models/Employee');
require('./src/models/Shop');
const WeeklySalary = require('./src/models/WeeklySalary');
const Attendance = require('./src/models/Attendance');

async function run() {
  await mongoose.connect(MONGO_URI);

  // Latest salary doc
  const sal = await WeeklySalary.findOne().sort({ weekStartDate: -1 }).populate('employee', 'name').lean();
  if (sal) {
    console.log('Latest salary:');
    console.log('  Employee:', sal.employee?.name || sal.employeeName);
    console.log('  weekLabel:', sal.weekLabel);
    console.log('  weekStartDateString:', sal.weekStartDateString);
    console.log('  weekEndDateString:', sal.weekEndDateString);
    console.log('  workingDays:', sal.workingDays);
    console.log('  breakdown count:', sal.attendanceBreakdown?.length);
    if (sal.attendanceBreakdown?.length) {
      sal.attendanceBreakdown.forEach(b => console.log('    ', b.dateString, b.dayOfWeek));
    }
  }

  // Attendance coverage for 27 Sep - 3 Oct week
  const counts = await Attendance.aggregate([
    { $match: { dateString: { $gte: '2026-09-27', $lte: '2026-10-03' } } },
    { $group: { _id: '$dateString', count: { $sum: 1 }, statuses: { $addToSet: '$approvalStatus' } } },
    { $sort: { _id: 1 } }
  ]);
  console.log('\nAttendance per day (27 Sep-3 Oct):');
  counts.forEach(c => console.log(' ', c._id, ':', c.count, 'records | statuses:', c.statuses.join(',')));

  await mongoose.disconnect();
}
run().catch(e => { console.error(e.message); process.exit(1); });
