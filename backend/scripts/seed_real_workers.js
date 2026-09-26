const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../src/config/db');
const Shop = require('../src/models/Shop');
const Employee = require('../src/models/Employee');
const Attendance = require('../src/models/Attendance');
const WeeklySalary = require('../src/models/WeeklySalary');
const SalaryPayment = require('../src/models/SalaryPayment');
const LedgerTransaction = require('../src/models/LedgerTransaction');
const Bonus = require('../src/models/Bonus');
const SalaryAdjustment = require('../src/models/SalaryAdjustment');
const SequenceCounter = require('../src/models/SequenceCounter');
const User = require('../src/models/User');

const REAL_WORKER_NAMES = [
  'Shiva',
  'Qasim',
  'Arslan',
  'Sam',
  'Fardin',
  'Shafique',
  'Ash',
  'Ubaid',
  'Anas',
  'Dave',
  'Wali',
  'Zamad',
  'Shahzad',
  'Ali',
  'Jebran',
  'Abdullah'
];

async function seedRealWorkers() {
  console.log('Connecting to database...');
  await connectDB();

  // 1. Verify shops and users exist
  const shops = await Shop.find({ status: 'Active' });
  if (!shops.length) {
    throw new Error('No active shops found! Aborting to prevent data corruption.');
  }
  const adminUser = await User.findOne({ username: 'admin' });
  const defaultShop = shops.find(s => s.name === 'Station') || shops[0];

  console.log(`Preserving ${shops.length} shops:`, shops.map(s => s.name).join(', '));
  console.log('Default assigned shop:', defaultShop.name);

  // 2. Remove test data only (leaving shops, schedules, and users intact)
  console.log('Removing old test data (employees, attendances, salaries, payments, ledgers, bonuses)...');
  await Promise.all([
    Employee.deleteMany({}),
    Attendance.deleteMany({}),
    WeeklySalary.deleteMany({}),
    SalaryPayment.deleteMany({}),
    LedgerTransaction.deleteMany({}),
    Bonus.deleteMany({}),
    SalaryAdjustment.deleteMany({}),
    SequenceCounter.deleteMany({})
  ]);
  console.log('✓ All test transactional and employee data cleared successfully.');

  // 3. Insert real workers
  console.log(`Inserting ${REAL_WORKER_NAMES.length} real workers...`);
  const now = new Date();
  const createdEmployees = [];

  for (let i = 0; i < REAL_WORKER_NAMES.length; i++) {
    const name = REAL_WORKER_NAMES[i];
    const seq = i + 1;
    const employeeId = `PIXX${String(seq).padStart(3, '0')}`;

    const emp = await Employee.create({
      name,
      employeeId,
      dailyWage: 0, // Admin will set individual daily wages
      employmentStatus: 'Active',
      assignedShop: defaultShop._id,
      startDate: now,
      notes: 'Real staff member - daily wage pending admin assignment',
      wageHistory: [
        {
          wage: 0,
          effectiveDate: now,
          changedBy: adminUser?._id || null,
          reason: 'Initial worker registration'
        }
      ],
      shopHistory: [
        {
          shop: defaultShop._id,
          shopName: defaultShop.name,
          effectiveDate: now,
          changedBy: adminUser?._id || null,
          reason: 'Initial default shop assignment'
        }
      ]
    });
    createdEmployees.push(emp);
    console.log(`  [${seq}/${REAL_WORKER_NAMES.length}] Created: ${emp.name} (${emp.employeeId})`);
  }

  // 4. Initialize SequenceCounter to match last created employee
  await SequenceCounter.create({
    _id: 'employee',
    sequence: REAL_WORKER_NAMES.length
  });
  console.log(`✓ Sequence counter initialized at ${REAL_WORKER_NAMES.length}.`);

  console.log('\n======================================================');
  console.log(`SUCCESSFULLY ONBOARDED ${createdEmployees.length} REAL WORKERS:`);
  console.log('======================================================');
  createdEmployees.forEach(e => {
    console.log(`• ${e.employeeId} — ${e.name} (Shop: ${defaultShop.name}, Daily Wage: £${e.dailyWage})`);
  });
  console.log('======================================================\n');

  process.exit(0);
}

seedRealWorkers().catch(err => {
  console.error('Error seeding real workers:', err);
  process.exit(1);
});
