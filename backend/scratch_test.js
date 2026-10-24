const mongoose = require('mongoose');
require('dotenv').config();
require('./src/models/Employee');
require('./src/models/Shop');
require('./src/models/SalaryPayment');
require('./src/models/Bonus');
const WeeklySalary = require('./src/models/WeeklySalary');
const Employee = require('./src/models/Employee');
const Bonus = require('./src/models/Bonus');
const { recalculateEmployeeLedger } = require('./src/utils/ledgerHelper');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  const allSalaries = await WeeklySalary.find({
    status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] }
  }).populate('employee').sort({ weekStartDate: 1 });

  const allBonuses = await Bonus.find({ status: { $ne: 'DRAFT' } }).lean();

  // Group salaries by employee
  const byEmp = {};
  for (const s of allSalaries) {
    if (!s.employee || s.employee.dailyWage === 0) continue;
    const empId = s.employee._id.toString();
    if (!byEmp[empId]) byEmp[empId] = [];
    byEmp[empId].push(s);
  }

  console.log('Total eligible employees with salaries:', Object.keys(byEmp).length);

  for (const [empId, list] of Object.entries(byEmp)) {
    const emp = list[0].employee;
    const ledger = await recalculateEmployeeLedger(empId);
    let runningRemaining = Number(emp.openingBalance || 0);

    const weekResults = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const opening = i === 0 ? Number(emp.openingBalance || 0) : runningRemaining;
      
      // Bonus: only if assigned to this salary, OR directly on s.bonus, OR created within this week's date range
      const sStart = new Date(s.weekStartDate);
      const sEnd = new Date(s.weekEndDate);
      sEnd.setHours(23, 59, 59, 999);

      const empBonuses = allBonuses.filter(b => b.employee && b.employee.toString() === empId);
      const weekBonusFromDocs = empBonuses.filter(b => {
        if (b.assignedWeeklySalary) {
          return b.assignedWeeklySalary.toString() === s._id.toString();
        }
        const bDate = new Date(b.createdAt);
        return bDate >= sStart && bDate <= sEnd;
      }).reduce((sum, b) => sum + (Number(b.bonusAmount) || 0), 0);

      const bonus = Number(((s.bonus || 0) > 0 ? s.bonus : weekBonusFromDocs).toFixed(2));
      const weeklySalary = Number(s.finalSalary || 0);
      const totalPayable = Number((opening + weeklySalary + bonus).toFixed(2));
      const totalPaid = Number(s.totalPaid || 0);
      const remaining = Number(Math.max(0, totalPayable - totalPaid).toFixed(2));
      
      runningRemaining = remaining;
      weekResults.push({
        week: s.weekLabel,
        opening,
        salary: weeklySalary,
        bonus,
        payable: totalPayable,
        paid: totalPaid,
        remaining
      });
    }

    const lastRemaining = weekResults[weekResults.length - 1].remaining;
    const diff = Math.abs(lastRemaining - ledger.currentBalance);
    if (diff > 0.01) {
      console.log('DISCREPANCY for', emp.name, 'Week remaining:', lastRemaining, 'Ledger:', ledger.currentBalance);
      console.log('Weeks:', weekResults);
    } else {
      console.log('MATCH:', emp.name, 'Remaining:', lastRemaining, '== Ledger:', ledger.currentBalance);
    }
  }
  process.exit(0);
}
test();
