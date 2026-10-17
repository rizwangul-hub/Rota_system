const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rota_system';
  await mongoose.connect(uri);
  const WeeklySalary = require('../src/models/WeeklySalary');

  const salaries = await WeeklySalary.find({
    weekStartDateString: '2026-10-11'
  }).lean();

  console.log('Week 11/10 - 17/10 Weekly Salaries:');
  salaries.forEach(s => {
    console.log(`${s.employeeName.padEnd(15)} | Days: ${s.workingDays} | Gross: £${s.grossDailyWages} | LateDed: £${s.lateDeductions} | NetPay: £${s.netAttendancePay} | Final: £${s.finalSalary} | Status: ${s.status}`);
  });

  await mongoose.disconnect();
}
run().catch(console.error);
