const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db');
const User = require('../models/User');
const Shop = require('../models/Shop');
const ShopSchedule = require('../models/ShopSchedule');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const WeeklySalary = require('../models/WeeklySalary');
const SalaryAdjustment = require('../models/SalaryAdjustment');
const SalaryPayment = require('../models/SalaryPayment');
const Bonus = require('../models/Bonus');
const LedgerTransaction = require('../models/LedgerTransaction');
const SystemSetting = require('../models/SystemSetting');
const SequenceCounter = require('../models/SequenceCounter');
const { calculateAttendanceRecord, getWeekRange, formatUKDate } = require('../utils/calc');

function getConfirmedSeedPassword() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The destructive seed script cannot run in production.');
  }
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    throw new Error('Set ALLOW_DESTRUCTIVE_SEED=true only for an isolated disposable database.');
  }
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI must explicitly target the disposable seed database.');
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(new URL(process.env.MONGO_URI).pathname.slice(1));
  } catch {
    throw new Error('MONGO_URI must be a valid MongoDB URL with an explicit database name.');
  }
  if (!databaseName || process.env.SEED_TARGET_DATABASE !== databaseName) {
    throw new Error('SEED_TARGET_DATABASE must exactly match the database name in MONGO_URI.');
  }

  const password = process.env.SEED_USER_PASSWORD;
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('SEED_USER_PASSWORD must be set to at least 12 characters.');
  }
  return password;
}

const seedData = async () => {
  try {
    const seedPassword = getConfirmedSeedPassword();
    await connectDB();
    console.log('Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Shop.deleteMany({}),
      ShopSchedule.deleteMany({}),
      Employee.deleteMany({}),
      Attendance.deleteMany({}),
      WeeklySalary.deleteMany({}),
      SalaryAdjustment.deleteMany({}),
      SalaryPayment.deleteMany({}),
      Bonus.deleteMany({}),
      LedgerTransaction.deleteMany({}),
      SequenceCounter.deleteMany({}),
      SystemSetting.deleteMany({})
    ]);

    // 1. System Settings
    console.log('Seeding System Settings...');
    await SystemSetting.create([
      { key: 'GRACE_PERIOD_MINUTES', value: 15, description: 'Lateness grace period in minutes' },
      { key: 'SALARY_WEEK_START_DAY', value: 1, description: '1 = Monday' }
    ]);

    // 2. Six Bicycle Shops
    console.log('Seeding 6 PixxTechnologies Bicycle Shops...');
    const shopsData = [
      { name: 'Station', code: 'STAT', address: '12 Railway Approach, London', phone: '020 7946 0101' },
      { name: 'Camden', code: 'CAMD', address: '45 Camden High Street, London', phone: '020 7946 0102' },
      { name: 'Chelsea', code: 'CHEL', address: '88 King\'s Road, London', phone: '020 7946 0103' },
      { name: 'Edgware', code: 'EDGW', address: '102 Station Road, Edgware', phone: '020 7946 0104' },
      { name: 'Southwark', code: 'SOUT', address: '34 Southwark Bridge Road, London', phone: '020 7946 0105' },
      { name: 'Leebridge', code: 'LEEB', address: '77 Lea Bridge Road, London', phone: '020 7946 0106' }
    ];

    const shops = await Shop.insertMany(shopsData);
    const shopMap = {};
    shops.forEach(s => { shopMap[s.name] = s; });

    // 3. Shop Schedules (Mon-Fri 09-19, Sat 09-18, Sun 11-17)
    console.log('Seeding Shop Schedules...');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const schedules = [];

    for (let day = 0; day <= 6; day++) {
      let open = '09:00';
      let close = '19:00';
      let hours = 10;

      if (day === 0) { // Sunday
        open = '11:00';
        close = '17:00';
        hours = 6;
      } else if (day === 6) { // Saturday
        open = '09:00';
        close = '18:00';
        hours = 9;
      }

      schedules.push({
        shop: null, // default for all
        dayOfWeek: day,
        dayName: dayNames[day],
        openingTime: open,
        closingTime: close,
        defaultHours: hours
      });
    }
    await ShopSchedule.insertMany(schedules);

    // 4. User Accounts
    console.log('Seeding User Accounts...');
    const adminUser = await User.create({
      name: 'System Admin',
      username: 'admin',
      password: seedPassword,
      role: 'ADMIN'
    });

    const sarfrazUser = await User.create({
      name: 'Sarfraz Khan',
      username: 'sarfraz',
      password: seedPassword,
      role: 'ATTENDANCE_CHECKER'
    });

    const distributorUser = await User.create({
      name: 'Salary Distributor',
      username: 'distributor',
      password: seedPassword,
      role: 'SALARY_DISTRIBUTOR'
    });

    const usmanUser = await User.create({
      name: 'Usman Salahuddin',
      username: 'usman',
      password: seedPassword,
      role: 'ATTENDANCE_OPERATOR',
      assignedShop: shopMap['Station']._id
    });

    // 5. Employees
    console.log('Seeding Employees...');
    const employeesData = [
      { name: 'Shahab Ahmad', employeeId: 'PIXX001', phone: '07123456001', email: 'shahab@pixx.co.uk', assignedShop: shopMap['Station']._id, dailyWage: 50 },
      { name: 'Abdullah', employeeId: 'PIXX002', phone: '07123456002', email: 'abdullah@pixx.co.uk', assignedShop: shopMap['Leebridge']._id, dailyWage: 50 },
      { name: 'Sajid', employeeId: 'PIXX003', phone: '07123456003', email: 'sajid@pixx.co.uk', assignedShop: shopMap['Southwark']._id, dailyWage: 50 },
      { name: 'Wali', employeeId: 'PIXX004', phone: '07123456004', email: 'wali@pixx.co.uk', assignedShop: shopMap['Edgware']._id, dailyWage: 50 },
      { name: 'Shafique', employeeId: 'PIXX005', phone: '07123456005', email: 'shafique@pixx.co.uk', assignedShop: shopMap['Camden']._id, dailyWage: 50 },
      { name: 'John Smith', employeeId: 'PIXX006', phone: '07123456006', email: 'john@pixx.co.uk', assignedShop: shopMap['Chelsea']._id, dailyWage: 50 },
      { name: 'Oliver Brown', employeeId: 'PIXX007', phone: '07123456007', email: 'oliver@pixx.co.uk', assignedShop: shopMap['Station']._id, dailyWage: 55 },
      { name: 'George Taylor', employeeId: 'PIXX008', phone: '07123456008', email: 'george@pixx.co.uk', assignedShop: shopMap['Camden']._id, dailyWage: 60 }
    ];

    const employees = await Employee.insertMany(employeesData);
    const empMap = {};
    employees.forEach(e => { empMap[e.name] = e; });

    // 6. Attendance & Calculation Test Records
    console.log('Seeding Sample Attendance Records...');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Example 1: Shahab Ahmad (on-time: 09:00 -> £50 pay)
    const c1 = calculateAttendanceRecord({ dailyWage: 50, shiftStart: '09:00', shiftEnd: '19:00', timeReached: '09:00', workerEndTime: '19:00', status: 'Present' });
    await Attendance.create({
      date: today,
      dateString: todayStr,
      employee: empMap['Shahab Ahmad']._id,
      employeeName: 'Shahab Ahmad',
      employeeId: 'PIXX001',
      shop: shopMap['Station']._id,
      shopName: 'Station',
      shiftStart: '09:00',
      timeReached: '09:00',
      shiftEnd: '19:00',
      workerEndTime: '19:00',
      scheduledHours: c1.scheduledHours,
      actualHours: c1.actualHours,
      lateMinutes: c1.lateMinutes,
      status: c1.status,
      dailyWage: 50,
      hourlyWage: c1.hourlyWage,
      lateDeduction: c1.lateDeduction,
      attendancePay: c1.attendancePay,
      remarks: 'On time',
      approvalStatus: 'Checked',
      createdBy: usmanUser._id,
      checkedBy: sarfrazUser._id,
      checkedByName: sarfrazUser.name,
      checkedAt: new Date()
    });

    // Example 2: Abdullah (10 minutes late: 09:10 -> tolerated, £0 deduction, £50 pay)
    const c2 = calculateAttendanceRecord({ dailyWage: 50, shiftStart: '09:00', shiftEnd: '19:00', timeReached: '09:10', workerEndTime: '19:00', status: 'Present' });
    await Attendance.create({
      date: today,
      dateString: todayStr,
      employee: empMap['Abdullah']._id,
      employeeName: 'Abdullah',
      employeeId: 'PIXX002',
      shop: shopMap['Leebridge']._id,
      shopName: 'Leebridge',
      shiftStart: '09:00',
      timeReached: '09:10',
      shiftEnd: '19:00',
      workerEndTime: '19:00',
      scheduledHours: c2.scheduledHours,
      actualHours: c2.actualHours,
      lateMinutes: c2.lateMinutes,
      status: c2.status,
      dailyWage: 50,
      hourlyWage: c2.hourlyWage,
      lateDeduction: c2.lateDeduction,
      attendancePay: c2.attendancePay,
      remarks: '10 mins late (within grace)',
      approvalStatus: 'Pending Review',
      createdBy: usmanUser._id
    });

    // Example 3: Sajid (30 minutes late: 09:30 -> £2.50 deduction, £47.50 pay)
    const c3 = calculateAttendanceRecord({ dailyWage: 50, shiftStart: '09:00', shiftEnd: '19:00', timeReached: '09:30', workerEndTime: '19:00', status: 'Late' });
    await Attendance.create({
      date: today,
      dateString: todayStr,
      employee: empMap['Sajid']._id,
      employeeName: 'Sajid',
      employeeId: 'PIXX003',
      shop: shopMap['Southwark']._id,
      shopName: 'Southwark',
      shiftStart: '09:00',
      timeReached: '09:30',
      shiftEnd: '19:00',
      workerEndTime: '19:00',
      scheduledHours: c3.scheduledHours,
      actualHours: c3.actualHours,
      lateMinutes: c3.lateMinutes,
      status: c3.status,
      dailyWage: 50,
      hourlyWage: c3.hourlyWage,
      lateDeduction: c3.lateDeduction,
      attendancePay: c3.attendancePay,
      remarks: 'Train delay (30 mins late)',
      approvalStatus: 'Pending Review',
      createdBy: usmanUser._id
    });

    // 7. Monthly Sales Commission (Matching Image 1: Commission Details)
    console.log('Seeding Commission Details (August 2026)...');
    const bonuses = [
      { employee: empMap['Abdullah']._id, employeeName: 'Abdullah', shop: shopMap['Leebridge']._id, shopName: 'Leebridge', month: 'Aug', year: 2026, commitmentText: '1% - Leebridge', salesAmount: 12000, bonusPercentage: 1, bonusAmount: 120 },
      { employee: empMap['Sajid']._id, employeeName: 'Sajid', shop: shopMap['Southwark']._id, shopName: 'Southwark', month: 'Aug', year: 2026, commitmentText: '3% - Southwark', salesAmount: 15000, bonusPercentage: 3, bonusAmount: 450 },
      { employee: empMap['Wali']._id, employeeName: 'Wali', shop: shopMap['Edgware']._id, shopName: 'Edgware', month: 'Aug', year: 2026, commitmentText: '1% - Edgware', salesAmount: 8500, bonusPercentage: 1, bonusAmount: 85 },
      { employee: empMap['Shafique']._id, employeeName: 'Shafique', shop: shopMap['Camden']._id, shopName: 'Camden', month: 'Aug', year: 2026, commitmentText: '1% - Camden', salesAmount: 11000, bonusPercentage: 1, bonusAmount: 110 }
    ];
    await Bonus.insertMany(bonuses);

    // 8. Weekly Salary & Installment Payments Test (Section 16 & 49: e.g. £150 or large salary test without duplication)
    console.log('Seeding Weekly Salary and Payments...');
    const week = getWeekRange(new Date());

    const shahabSalary = await WeeklySalary.create({
      employee: empMap['Shahab Ahmad']._id,
      employeeName: 'Shahab Ahmad',
      employeeId: 'PIXX001',
      shop: shopMap['Station']._id,
      shopName: 'Station',
      weekStartDate: week.startDate,
      weekEndDate: week.endDate,
      weekLabel: week.weekLabel,
      workingDays: 3,
      scheduledHours: 30,
      actualHours: 30,
      grossDailyWages: 150,
      lateDeductions: 0,
      netAttendancePay: 150,
      travelAllowance: 0,
      otherAllowances: 0,
      manualDeductions: 0,
      bonus: 0,
      finalSalary: 150,
      totalPaid: 150,
      balanceRemaining: 0,
      status: 'PAID',
      finalizedBy: adminUser._id,
      finalizedAt: new Date()
    });

    const payment = await SalaryPayment.create({
      weeklySalary: shahabSalary._id,
      employee: empMap['Shahab Ahmad']._id,
      employeeName: 'Shahab Ahmad',
      shop: shopMap['Station']._id,
      shopName: 'Station',
      weekLabel: week.weekLabel,
      amount: 150,
      paymentMethod: 'Cash',
      paymentDate: new Date(),
      paidBy: distributorUser._id,
      paidByName: distributorUser.name
    });

    // Ledger records: 1 earned, 1 paid -> balance = 0
    await LedgerTransaction.create([
      {
        employee: empMap['Shahab Ahmad']._id,
        date: week.weekEndDate,
        transactionType: 'SALARY_EARNED',
        description: `Weekly Salary for week ${week.weekLabel} (Station)`,
        referenceType: 'WeeklySalary',
        referenceId: shahabSalary._id,
        attendancePay: 150,
        lateDeduction: 0,
        allowance: 0,
        bonus: 0,
        otherDeduction: 0,
        amountEarned: 150,
        amountPaid: 0,
        runningBalance: 150,
        createdBy: adminUser._id
      },
      {
        employee: empMap['Shahab Ahmad']._id,
        date: new Date(),
        transactionType: 'PAYMENT_DISBURSED',
        description: `Payment via Cash for week ${week.weekLabel}`,
        referenceType: 'SalaryPayment',
        referenceId: payment._id,
        amountEarned: 0,
        amountPaid: 150,
        runningBalance: 0,
        createdBy: distributorUser._id
      }
    ]);

    console.log('Database seeded successfully with UK bicycle shops, employees, schedules, sample rota, and accounting data!');
    process.exit(0);
  } catch (err) {
    console.error('Error during seeding:', err);
    process.exit(1);
  }
};

if (require.main === module) {
  seedData();
}

module.exports = seedData;
