const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inflateSync } = require('node:zlib');
const { Writable } = require('node:stream');
const ExcelJS = require('exceljs');

const audit = require('../utils/audit');
const originalLogAction = audit.logAction;
const auditEvents = [];
audit.logAction = async event => auditEvents.push(event);

const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const SystemSetting = require('../models/SystemSetting');
const SequenceCounter = require('../models/SequenceCounter');
const WeeklySalary = require('../models/WeeklySalary');
const SalaryPayment = require('../models/SalaryPayment');
const reportRoutes = require('../routes/reportRoutes');
const employeeController = require('../controllers/employeeController');
const attendanceController = require('../controllers/attendanceController');
const reportController = require('../controllers/reportController');
const dashboardController = require('../controllers/dashboardController');
const {
  attendanceOperatorRecord,
  attendanceCheckerRecord,
  employeeAttendanceRosterEntry
} = require('../utils/attendanceViews');
const {
  generateWhatsAppAttendanceText,
  formatTime12Hour,
  buildDailyAttendanceExcel,
  buildWeeklyAttendanceExcel,
  buildShopLabourExcel
} = require('../utils/reports');

let passed = 0;

function test(name, run) {
  run();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function testAsync(name, run) {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    }
  };
}

class CaptureResponse extends Writable {
  constructor() {
    super();
    this.parts = [];
    this.headers = {};
    this.statusCode = 200;
  }

  _write(chunk, encoding, callback) {
    this.parts.push(Buffer.from(chunk));
    callback();
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  get buffer() {
    return Buffer.concat(this.parts);
  }
}

function routeAuthorization(path) {
  const routeLayer = reportRoutes.stack.find(layer => layer.route?.path === path);
  assert.ok(routeLayer, `Expected report route ${path}`);
  return routeLayer.route.stack[1].handle;
}

function replaceMethod(target, key, replacement, restoreList) {
  const original = target[key];
  target[key] = replacement;
  restoreList.push(() => { target[key] = original; });
}

async function run() {
  const restores = [];
  const financeFixture = {
    _id: 'att-1',
    dateString: '2026-04-05',
    employeeName: 'Alex Worker',
    employeeId: 'EMP-01',
    shopName: 'Main Shop',
    shiftStart: '09:00',
    shiftEnd: '17:00',
    timeReached: '09:10',
    workerEndTime: '17:00',
    status: 'Late',
    approvalStatus: 'Pending Review',
    remarks: 'Traffic',
    dailyWage: 987.65,
    hourlyWage: 123.45,
    lateDeduction: 12.34,
    attendancePay: 975.31,
    lateMinutes: 10,
    actualHours: 7.83,
    scheduledHours: 8,
    secretInternalField: 'must not leak',
    employee: { _id: 'emp-1', name: 'Alex Worker', employeeId: 'EMP-01', dailyWage: 987.65 },
    shop: { _id: 'shop-1', name: 'Main Shop', privateNote: 'must not leak' }
  };

  try {
    test('attendance display formatting uses 12-hour time without changing invalid values', () => {
      assert.equal(formatTime12Hour('00:00'), '12:00 AM');
      assert.equal(formatTime12Hour('09:10'), '9:10 AM');
      assert.equal(formatTime12Hour('12:00'), '12:00 PM');
      assert.equal(formatTime12Hour('17:00'), '5:00 PM');
      assert.equal(formatTime12Hour('23:59'), '11:59 PM');
      assert.equal(formatTime12Hour(''), '');
    });

    test('operator attendance serializer removes financial, internal, and nested sensitive fields', () => {
      const response = attendanceOperatorRecord(financeFixture);
      for (const key of ['dailyWage', 'hourlyWage', 'lateDeduction', 'attendancePay', 'lateMinutes', 'actualHours', 'scheduledHours', 'secretInternalField']) {
        assert.equal(Object.hasOwn(response, key), false, `${key} must be omitted`);
      }
      assert.deepEqual(response.employee, { _id: 'emp-1', name: 'Alex Worker', employeeId: 'EMP-01' });
      assert.deepEqual(response.shop, { _id: 'shop-1', name: 'Main Shop' });
    });

    test('checker attendance serializer retains review details but removes all wage fields', () => {
      const response = attendanceCheckerRecord(financeFixture);
      for (const key of ['dailyWage', 'hourlyWage', 'lateDeduction', 'attendancePay', 'secretInternalField']) {
        assert.equal(Object.hasOwn(response, key), false, `${key} must be omitted`);
      }
      assert.equal(response.actualHours, 7.83);
      assert.equal(response.lateMinutes, 10);
      assert.deepEqual(response.employee, { _id: 'emp-1', name: 'Alex Worker', employeeId: 'EMP-01' });
    });

    test('operator roster serializer returns only safe worker identity and status', () => {
      const response = employeeAttendanceRosterEntry({
        _id: 'emp-1', name: 'Alex Worker', employeeId: 'EMP-01', employmentStatus: 'Active',
        assignedShop: 'shop-1', dailyWage: 987.65, wageHistory: [{ wage: 987.65 }], phone: 'private'
      });
      assert.deepEqual(response, {
        _id: 'emp-1', name: 'Alex Worker', employeeId: 'EMP-01', employmentStatus: 'Active'
      });
    });

    await testAsync('new employee IDs are generated sequentially without assigning a permanent shop', async () => {
      auditEvents.length = 0;
      let currentSequence = 15;
      let createdEmployee;
      replaceMethod(Employee, 'find', () => ({
        select() {
          return { lean: async () => [{ employeeId: 'PIXX014' }, { employeeId: 'PIXX015' }] };
        }
      }), restores);
      replaceMethod(Employee, 'findOne', async () => null, restores);
      replaceMethod(Employee, 'exists', async () => false, restores);
      replaceMethod(Employee, 'create', async data => {
        createdEmployee = { _id: 'emp-new', ...data };
        return createdEmployee;
      }, restores);
      replaceMethod(SequenceCounter, 'findById', async () => null, restores);
      replaceMethod(SequenceCounter, 'create', async data => ({ ...data }), restores);
      replaceMethod(SequenceCounter, 'findByIdAndUpdate', async () => ({
        _id: 'employee',
        sequence: ++currentSequence
      }), restores);

      const res = responseRecorder();
      await employeeController.createEmployee({
        body: { name: 'New Worker', email: 'new@example.com', dailyWage: '72.50' },
        user: { _id: 'admin-1', name: 'Admin', role: 'ADMIN' }
      }, res);
      assert.equal(res.statusCode, 201);
      assert.equal(res.body.employee.employeeId, 'PIXX016');
      assert.equal(createdEmployee.email, 'new@example.com');
      assert.equal(createdEmployee.dailyWage, 72.5);
      assert.equal(Object.hasOwn(createdEmployee, 'assignedShop'), false);
      assert.equal(createdEmployee.wageHistory[0].wage, 72.5);
      assert.equal(auditEvents[0].action, 'EMPLOYEE_CREATED');
    });

    await testAsync('new employee creation requires an admin-entered daily wage', async () => {
      const res = responseRecorder();
      await employeeController.createEmployee({
        body: { name: 'Worker Without Wage', email: '' },
        user: { _id: 'admin-1', name: 'Admin', role: 'ADMIN' }
      }, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /daily wage/i);
    });

    await testAsync('admin employee edit updates name, email, and wage history', async () => {
      const employee = {
        _id: 'emp-edit',
        name: 'Old Name',
        email: 'old@example.com',
        dailyWage: 50,
        employmentStatus: 'Active',
        wageHistory: [],
        async save() {}
      };
      let lookups = 0;
      replaceMethod(Employee, 'findById', async () => {
        lookups += 1;
        return employee;
      }, restores);
      const res = responseRecorder();
      await employeeController.updateEmployee({
        params: { id: 'emp-edit' },
        body: {
          name: 'Updated Name',
          email: 'updated@example.com',
          dailyWage: 64.5,
          wageChangeReason: 'Annual adjustment'
        },
        user: { _id: 'admin-1', name: 'Admin', role: 'ADMIN' }
      }, res);
      assert.equal(res.body.success, true);
      assert.equal(res.body.employee.name, 'Updated Name');
      assert.equal(res.body.employee.email, 'updated@example.com');
      assert.equal(res.body.employee.dailyWage, 64.5);
      assert.equal(employee.wageHistory[0].wage, 64.5);
      assert.equal(employee.wageHistory[0].reason, 'Annual adjustment');
      assert.equal(lookups, 2);
    });

    await testAsync('next employee ID preview reflects both the saved sequence and existing IDs', async () => {
      replaceMethod(Employee, 'find', () => ({
        select() {
          return { lean: async () => [{ employeeId: 'PIXX018' }] };
        }
      }), restores);
      replaceMethod(SequenceCounter, 'findById', async () => ({ sequence: 16 }), restores);
      const res = responseRecorder();
      await employeeController.getNextEmployeeId({}, res);
      assert.deepEqual(res.body, { success: true, employeeId: 'PIXX019' });
    });

    test('attendance WhatsApp text excludes wages and pay calculations', () => {
      const text = generateWhatsAppAttendanceText('05/04/2026', [financeFixture], 'Main Shop');
      for (const value of ['987.65', '123.45', '12.34', '975.31', 'Wage', 'Deduction', 'Pay']) {
        assert.equal(text.includes(value), false, `${value} must not appear`);
      }
      assert.match(text, /Alex Worker/);
      assert.match(text, /Late/);
      assert.match(text, /In: 9:10 AM - Out: 5:00 PM/);
      assert.equal(text.includes('17:00'), false);
    });

    await testAsync('attendance Excel contains attendance-only columns and values', async () => {
      const absentFixture = {
        ...financeFixture,
        _id: 'att-absent',
        employeeName: 'Absent Worker',
        shopName: 'Absent',
        shiftStart: '',
        shiftEnd: '',
        timeReached: '',
        workerEndTime: '',
        status: 'Absent'
      };
      const workbook = await buildDailyAttendanceExcel([financeFixture, absentFixture], '05/04/2026');
      const buffer = await workbook.xlsx.writeBuffer();
      const parsed = new ExcelJS.Workbook();
      await parsed.xlsx.load(buffer);
      const sheet = parsed.getWorksheet('Daily Attendance');
      const values = sheet.getSheetValues().flat().map(value => String(value ?? ''));
      const allText = values.join('|');
      assert.deepEqual(sheet.getRow(3).values.slice(1), [
        'Shop', 'Worker Name', 'Shift Start', 'Shift End',
        'Arrival', 'Leave', 'Status', 'Remarks'
      ]);
      for (const value of ['987.65', '123.45', '12.34', '975.31', 'Wage', 'Deduction', 'Pay']) {
        assert.equal(allText.includes(value), false, `${value} must not appear`);
      }
      assert.equal(allText.includes('SUBMITTED BY (ATTENDANCE OPERATOR)'), true);
      assert.equal(allText.includes('VERIFIED BY (ATTENDANCE CHECKER)'), true);
      assert.equal(sheet.getCell('B5').value, 'Absent Worker');
      assert.equal(sheet.getCell('C5').value, '');
      assert.equal(sheet.getCell('D5').value, '');
      assert.equal(sheet.getCell('E5').value, '');
      assert.equal(sheet.getCell('F5').value, '');
      assert.equal(sheet.getCell('G5').value, 'Absent / Off');
      assert.equal(sheet.getCell('E4').value, '9:10 AM');
      assert.equal(sheet.getCell('F4').value, '5:00 PM');
      assert.equal(sheet.getCell('A1').value, 'PIXX ROTA  |  DAILY ATTENDANCE');
      assert.match(sheet.getCell('A2').value, /12-hour format/);
      assert.equal(sheet.views[0].state, 'frozen');
      assert.equal(sheet.views[0].ySplit, 3);
      assert.equal(sheet.autoFilter, 'A3:H5');
      assert.equal(sheet.getCell('G4').fill.fgColor.argb, 'FFFFF7ED');
      assert.equal(sheet.getCell('G5').fill.fgColor.argb, 'FFFEF2F2');
      assert.equal(sheet.pageSetup.orientation, 'landscape');
      assert.equal(sheet.getColumn(8).width, 32);
    });

    test('Vercel backend configurations include daily report signature assets', () => {
      const repositoryRoot = path.resolve(__dirname, '../../..');
      const deploymentConfigs = [
        {
          file: path.join(repositoryRoot, 'vercel.json'),
          expected: 'backend/src/assets/**'
        },
        {
          file: path.join(repositoryRoot, 'backend/vercel.json'),
          expected: 'src/assets/**'
        }
      ];

      for (const { file, expected } of deploymentConfigs) {
        const config = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.equal(config.builds[0].config.includeFiles, expected);
      }

      assert.equal(fs.existsSync(path.join(repositoryRoot, 'backend/src/assets/usmansign.png')), true);
      assert.equal(fs.existsSync(path.join(repositoryRoot, 'backend/src/assets/sarfrazsign.png')), true);
    });

    await testAsync('daily attendance PDF generates with bundled signature images', async () => {
      replaceMethod(Attendance, 'find', () => ({
        sort: async () => []
      }), restores);
      auditEvents.length = 0;
      const res = new CaptureResponse();
      const finish = new Promise((resolve, reject) => {
        res.once('finish', resolve);
        res.once('error', reject);
      });

      await reportController.exportDailyAttendancePDF({
        query: { date: '2026-04-05' },
        user: { _id: 'checker-1', name: 'Sarfraz', role: 'ATTENDANCE_CHECKER' }
      }, res);
      await finish;

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'application/pdf');
      assert.equal(res.buffer.subarray(0, 4).toString('ascii'), '%PDF');
      assert.ok(res.buffer.length > 1000);
    });

    test('daily attendance exports remain checker/admin-only while attendance report is operator-readable', () => {
      const dailyReportAuth = routeAuthorization('/daily-attendance');
      const excelAuth = routeAuthorization('/daily-attendance/excel');
      const pdfAuth = routeAuthorization('/daily-attendance/pdf');
      const check = (middleware, role) => {
        let nextCalled = false;
        const res = responseRecorder();
        middleware({ user: { role } }, res, () => { nextCalled = true; });
        return { nextCalled, statusCode: res.statusCode };
      };
      assert.equal(check(dailyReportAuth, 'ATTENDANCE_OPERATOR').nextCalled, true);
      assert.equal(check(excelAuth, 'ATTENDANCE_OPERATOR').statusCode, 403);
      assert.equal(check(pdfAuth, 'ATTENDANCE_OPERATOR').statusCode, 403);
      assert.equal(check(excelAuth, 'ATTENDANCE_CHECKER').nextCalled, true);
      assert.equal(check(pdfAuth, 'ADMIN').nextCalled, true);
      assert.equal(check(routeAuthorization('/weekly-salary'), 'ATTENDANCE_CHECKER').statusCode, 403);
      assert.equal(check(routeAuthorization('/weekly-staff'), 'ATTENDANCE_CHECKER').statusCode, 403);
    });

    await testAsync('operator employee list ignores assigned-shop and wage-based sorting requests', async () => {
      let capturedQuery;
      let capturedSort;
      replaceMethod(Employee, 'find', query => {
        capturedQuery = query;
        return {
          populate() {
            return {
              sort: async sort => {
                capturedSort = sort;
                return [{
                  _id: 'emp-1', name: 'Alex Worker', employeeId: 'EMP-01',
                  employmentStatus: 'Active', dailyWage: 987.65, assignedShop: 'shop-1'
                }];
              }
            };
          }
        };
      }, restores);
      const res = responseRecorder();
      await employeeController.getAllEmployees({
        user: { role: 'ATTENDANCE_OPERATOR' },
        query: { shop: 'shop-2', sortBy: 'dailyWage', sortOrder: 'desc' }
      }, res);
      assert.equal(Object.hasOwn(capturedQuery, 'assignedShop'), false);
      assert.deepEqual(capturedSort, { name: 1 });
      assert.deepEqual(res.body.employees[0], {
        _id: 'emp-1', name: 'Alex Worker', employeeId: 'EMP-01', employmentStatus: 'Active'
      });
    });

    await testAsync('checker employee list and details omit wage and wage-history fields', async () => {
      const employeeFixture = {
        _id: 'emp-1',
        name: 'Alex Worker',
        employeeId: 'EMP-01',
        employmentStatus: 'Active',
        dailyWage: 987.65,
        wageHistory: [{ wage: 987.65 }],
        assignedShop: 'shop-1'
      };
      replaceMethod(Employee, 'find', () => ({
        populate() {
          return {
            sort: async () => [employeeFixture]
          };
        }
      }), restores);
      replaceMethod(Employee, 'findById', () => ({
        populate: async () => employeeFixture
      }), restores);
      const listResponse = responseRecorder();
      await employeeController.getAllEmployees({
        user: { role: 'ATTENDANCE_CHECKER' },
        query: { sortBy: 'dailyWage', sortOrder: 'desc' }
      }, listResponse);
      const detailResponse = responseRecorder();
      await employeeController.getEmployeeById({
        user: { role: 'ATTENDANCE_CHECKER' },
        params: { id: 'emp-1' }
      }, detailResponse);

      for (const employee of [listResponse.body.employees[0], detailResponse.body.employee]) {
        assert.deepEqual(employee, {
          _id: 'emp-1',
          name: 'Alex Worker',
          employeeId: 'EMP-01',
          employmentStatus: 'Active'
        });
      }
    });

    await testAsync('operator cannot access payroll employee profiles', async () => {
      const res = responseRecorder();
      await employeeController.getEmployeeProfile({ user: { role: 'ATTENDANCE_OPERATOR' }, params: { id: 'emp-1' } }, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
    });

    await testAsync('checker cannot access employee payroll profiles', async () => {
      const res = responseRecorder();
      await employeeController.getEmployeeProfile({
        user: { role: 'ATTENDANCE_CHECKER' },
        params: { id: 'emp-1' }
      }, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
    });

    await testAsync('pending attendance and checker dashboard omit all wage amounts', async () => {
      const records = [{
        ...financeFixture,
        toObject() { return { ...this }; }
      }];
      replaceMethod(Attendance, 'find', query => {
        if (query.approvalStatus === 'Pending Review') {
          return {
            populate() { return this; },
            sort: async () => records
          };
        }
        return Promise.resolve(records);
      }, restores);
      const pendingResponse = responseRecorder();
      await attendanceController.getPendingAttendance({
        user: { role: 'ATTENDANCE_CHECKER' },
        query: {}
      }, pendingResponse);
      assert.equal(Object.hasOwn(pendingResponse.body.records[0], 'attendancePay'), false);
      assert.equal(Object.hasOwn(pendingResponse.body.records[0], 'dailyWage'), false);

      const dashboardResponse = responseRecorder();
      await dashboardController.getCheckerDashboard({
        user: { role: 'ATTENDANCE_CHECKER' }
      }, dashboardResponse);
      assert.equal(Object.hasOwn(dashboardResponse.body.stats, 'totalWages'), false);
      assert.equal(Object.hasOwn(dashboardResponse.body.stats, 'totalDeductions'), false);
      assert.equal(Object.hasOwn(dashboardResponse.body.pendingRecords[0], 'attendancePay'), false);
      assert.equal(Object.hasOwn(dashboardResponse.body.pendingRecords[0], 'dailyWage'), false);
    });

    await testAsync('daily attendance report redacts financial values and totals for operators', async () => {
      const records = [{
        ...financeFixture,
        toObject() { return { ...this }; }
      }];
      replaceMethod(Attendance, 'find', () => ({
        populate() { return this; },
        sort: async () => records
      }), restores);
      replaceMethod(Shop, 'findById', async () => null, restores);
      const res = responseRecorder();
      await reportController.getDailyAttendanceReport({
        user: { role: 'ATTENDANCE_OPERATOR' },
        query: { date: '2026-04-05' }
      }, res);
      assert.equal(res.body.success, true);
      for (const key of ['totalDailyWages', 'totalLateDeductions', 'totalAttendancePay', 'totalWorkedHours']) {
        assert.equal(Object.hasOwn(res.body.summary, key), false);
      }
      for (const key of ['dailyWage', 'hourlyWage', 'lateDeduction', 'attendancePay', 'actualHours']) {
        assert.equal(Object.hasOwn(res.body.records[0], key), false);
      }
      for (const value of ['987.65', '123.45', '12.34', '975.31']) {
        assert.equal(res.body.whatsAppText.includes(value), false);
      }
    });

    await testAsync('attendance checker report omits financial values but retains attendance details', async () => {
      const records = [{
        ...financeFixture,
        toObject() { return { ...this }; }
      }];
      replaceMethod(Attendance, 'find', () => ({
        populate() { return this; },
        sort: async () => records
      }), restores);
      replaceMethod(Shop, 'findById', async () => null, restores);
      const res = responseRecorder();
      await reportController.getDailyAttendanceReport({
        user: { role: 'ATTENDANCE_CHECKER' },
        query: { date: '2026-04-05' }
      }, res);

      assert.equal(res.body.success, true);
      for (const key of ['totalDailyWages', 'totalLateDeductions', 'totalAttendancePay']) {
        assert.equal(Object.hasOwn(res.body.summary, key), false);
      }
      for (const key of ['dailyWage', 'hourlyWage', 'lateDeduction', 'attendancePay']) {
        assert.equal(Object.hasOwn(res.body.records[0], key), false);
      }
      assert.equal(res.body.records[0].timeReached, '09:10');
      assert.equal(res.body.records[0].status, 'Late');
      assert.match(res.body.whatsAppText, /Alex Worker/);
    });

    await testAsync('weekly attendance report omits employee and aggregate wages for checkers', async () => {
      const records = [{ ...financeFixture }];
      replaceMethod(Attendance, 'find', () => ({
        sort: async () => records
      }), restores);
      const res = responseRecorder();
      await reportController.getWeeklyAttendanceReport({
        user: { role: 'ATTENDANCE_CHECKER' },
        query: { date: '2026-04-05' }
      }, res);
      assert.equal(res.body.success, true);
      assert.equal(Object.hasOwn(res.body.summary, 'totalAttendancePay'), false);
      assert.equal(Object.hasOwn(res.body.summary, 'totalLateDeductions'), false);
      assert.equal(Object.hasOwn(res.body.records[0], 'attendancePay'), false);
      assert.equal(Object.hasOwn(res.body.records[0], 'lateDeduction'), false);
      assert.equal(res.body.records[0].actualHours, 7.83);
    });

    await testAsync('shop labour reports omit wage data from checker responses', async () => {
      const attendanceRows = [{
        ...financeFixture,
        shop: 'shop-1',
        employee: 'emp-1',
        toString() { return this._id; }
      }];
      replaceMethod(Attendance, 'find', () => ({
        sort: async () => attendanceRows,
        then(resolve, reject) {
          return Promise.resolve(attendanceRows).then(resolve, reject);
        }
      }), restores);
      const labourResponse = responseRecorder();
      await reportController.getShopLabourHours({
        user: { role: 'ATTENDANCE_CHECKER' },
        query: {}
      }, labourResponse);
      assert.equal(Object.hasOwn(labourResponse.body.grandTotals, 'totalWageCost'), false);
      assert.equal(Object.hasOwn(labourResponse.body.data[0], 'totalWageCost'), false);
      assert.equal(Object.hasOwn(labourResponse.body.data[0].employees[0], 'wageCost'), false);
      assert.equal(labourResponse.body.data[0].employees[0].hours, 7.83);

      replaceMethod(Shop, 'find', () => ({
        sort: async () => [{ _id: 'shop-1', name: 'Main Shop' }]
      }), restores);
      replaceMethod(WeeklySalary, 'find', async () => {
        assert.fail('Checker monthly labour summary must not query salary records.');
      }, restores);
      const monthlyResponse = responseRecorder();
      await reportController.getMonthlyShopLabourSummary({
        user: { role: 'ATTENDANCE_CHECKER' },
        query: { month: '4', year: '2026' }
      }, monthlyResponse);
      assert.equal(Object.hasOwn(monthlyResponse.body.shopSummaries[0], 'attendancePay'), false);
      assert.equal(Object.hasOwn(monthlyResponse.body.shopSummaries[0], 'finalizedSalaryCost'), false);
      assert.equal(Object.hasOwn(monthlyResponse.body.grandTotals, 'totalFinalizedSalaryCost'), false);
    });

    await testAsync('checker attendance workbooks contain no wage columns or amounts', async () => {
      const weekly = await buildWeeklyAttendanceExcel([{
        employeeName: 'Alex Worker',
        attendancePay: 975.31,
        lateDeduction: 12.34
      }], 'Week', { totalAttendancePay: 975.31, totalLateDeductions: 12.34 }, false);
      const weeklyBuffer = await weekly.xlsx.writeBuffer();
      const weeklyCopy = new ExcelJS.Workbook();
      await weeklyCopy.xlsx.load(weeklyBuffer);
      const weeklyText = weeklyCopy.getWorksheet('Weekly Attendance').getSheetValues().flat().join(' ');
      assert.equal(weeklyText.includes('Attendance Pay (£)'), false);
      assert.equal(weeklyText.includes('12.34'), false);
      assert.equal(weeklyText.includes('975.31'), false);
      const adminWeekly = await buildWeeklyAttendanceExcel([{
        attendancePay: 975.31
      }], 'Week', { totalAttendancePay: 975.31 });
      const adminWeeklyBuffer = await adminWeekly.xlsx.writeBuffer();
      const adminWeeklyCopy = new ExcelJS.Workbook();
      await adminWeeklyCopy.xlsx.load(adminWeeklyBuffer);
      const adminWeeklyText = adminWeeklyCopy.getWorksheet('Weekly Attendance').getSheetValues().flat().join(' ');
      assert.equal(adminWeeklyText.includes('Attendance Pay (£)'), true);
      assert.equal(adminWeeklyText.includes('975.31'), true);

      const labour = await buildShopLabourExcel([{
        shopName: 'Main Shop',
        employees: [{ employeeName: 'Alex Worker', wageCost: 975.31 }]
      }], 'Period', false);
      const labourBuffer = await labour.xlsx.writeBuffer();
      const labourCopy = new ExcelJS.Workbook();
      await labourCopy.xlsx.load(labourBuffer);
      const labourText = labourCopy.getWorksheet('Shop Labour Hours').getSheetValues().flat().join(' ');
      assert.equal(labourText.includes('Attendance Pay (£)'), false);
      assert.equal(labourText.includes('975.31'), false);
    });

    await testAsync('monthly Excel export generates a valid authenticated report file', async () => {
      auditEvents.length = 0;
      replaceMethod(Employee, 'findById', async () => ({
        _id: 'emp-report',
        name: 'Alex Worker',
        employeeId: 'PIXX021'
      }), restores);
      replaceMethod(WeeklySalary, 'find', () => ({
        sort: async () => [{
          _id: 'salary-week',
          weekLabel: '01/05/2026 - 07/05/2026',
          workingDays: 5,
          grossDailyWages: 350,
          lateDeductions: 10,
          manualDeductions: 5,
          bonus: 20,
          finalSalary: 355,
          balanceRemaining: 255
        }]
      }), restores);
      replaceMethod(SalaryPayment, 'find', async () => [{
        weeklySalary: 'salary-week',
        paymentMethod: 'Cash',
        amount: 100,
        paymentDate: new Date('2026-05-08T12:00:00Z')
      }], restores);
      const res = new CaptureResponse();
      const finish = new Promise((resolve, reject) => {
        res.once('finish', resolve);
        res.once('error', reject);
      });
      await reportController.exportEmployeeMonthlyExcel({
        query: { employeeId: 'emp-report', month: '5', year: '2026' },
        user: { _id: 'admin-1', name: 'Admin', role: 'ADMIN' }
      }, res);
      await finish;
      assert.equal(res.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      assert.match(res.headers['content-disposition'], /PIXX_Alex-Worker_May-26\.xlsx/);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.buffer);
      const sheet = workbook.getWorksheet('Monthly Report');
      assert.ok(sheet);
      assert.equal(sheet.getCell('A1').value, 'ALEX WORKER');
      assert.equal(sheet.getCell('A2').value, 'May-26');
      assert.equal(auditEvents[0].action, 'REPORT_EXPORTED_EXCEL');
    });

    await testAsync('monthly Excel rejects invalid period values before querying data', async () => {
      let employeeQueryCount = 0;
      replaceMethod(Employee, 'findById', async () => {
        employeeQueryCount += 1;
        return null;
      }, restores);
      const res = responseRecorder();
      await reportController.exportEmployeeMonthlyExcel({
        query: { employeeId: 'emp-report', month: '13', year: '2026' },
        user: { _id: 'admin-1', name: 'Admin', role: 'ADMIN' }
      }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(employeeQueryCount, 0);
    });

    await testAsync('single attendance save reassigns pending record to selected shop and preserves wage snapshot', async () => {
      auditEvents.length = 0;
      const employee = { _id: 'emp-1', name: 'Alex Worker', employeeId: 'EMP-01', employmentStatus: 'Active', dailyWage: 120 };
      const shop = { _id: 'shop-new', name: 'New Shop', status: 'Active', isActive: true };
      const existing = { _id: 'att-1', approvalStatus: 'Pending Review', dailyWage: 99 };
      let updateFilter;
      let updateData;
      let updateOptions;
      replaceMethod(Employee, 'findById', async () => employee, restores);
      replaceMethod(Shop, 'findById', async () => shop, restores);
      replaceMethod(Attendance, 'findOne', async () => existing, restores);
      replaceMethod(SystemSetting, 'findOne', async () => null, restores);
      replaceMethod(Attendance, 'findOneAndUpdate', async (filter, data, options) => {
        updateFilter = filter;
        updateData = data;
        updateOptions = options;
        return { _id: 'att-1', ...data };
      }, restores);
      const res = responseRecorder();
      await attendanceController.saveAttendance({
        body: {
          employeeId: 'emp-1', shopId: 'shop-new', date: '2026-04-05',
          shiftStart: '09:00', shiftEnd: '17:00', timeReached: '09:10', workerEndTime: '17:00'
        },
        user: { _id: 'operator-1', name: 'Usman', role: 'ATTENDANCE_OPERATOR' }
      }, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(updateFilter, { employee: 'emp-1', dateString: '2026-04-05' });
      assert.equal(updateData.shop, 'shop-new');
      assert.equal(updateData.dailyWage, 99);
      assert.equal(updateOptions.upsert, true);
      assert.equal(res.body.record.shopName, 'New Shop');
      assert.equal(Object.hasOwn(res.body.record, 'dailyWage'), false);
      assert.equal(auditEvents[0].action, 'ATTENDANCE_EDITED');
    });

    await testAsync('batch saves move pending records, skip checked records, and audit each saved record', async () => {
      auditEvents.length = 0;
      const employees = {
        'emp-1': { _id: 'emp-1', name: 'Alex Worker', employeeId: 'EMP-01', employmentStatus: 'Active', dailyWage: 120 },
        'emp-2': { _id: 'emp-2', name: 'Sam Worker', employeeId: 'EMP-02', employmentStatus: 'Active', dailyWage: 110 }
      };
      const existingByEmployee = {
        'emp-1': { _id: 'att-1', approvalStatus: 'Pending Review', dailyWage: 99 },
        'emp-2': { _id: 'att-2', approvalStatus: 'Checked', dailyWage: 88 }
      };
      let savedData;
      replaceMethod(Employee, 'findById', async id => employees[id], restores);
      replaceMethod(Shop, 'findById', async () => ({ _id: 'shop-new', name: 'New Shop', status: 'Active', isActive: true }), restores);
      replaceMethod(Attendance, 'findOne', async query => existingByEmployee[query.employee], restores);
      replaceMethod(SystemSetting, 'findOne', async () => null, restores);
      replaceMethod(Attendance, 'findOneAndUpdate', async (filter, data) => {
        savedData = data;
        return { _id: 'att-1', ...data };
      }, restores);
      const res = responseRecorder();
      await attendanceController.saveAttendanceBatch({
        body: {
          date: '2026-04-05',
          records: [
            { employeeId: 'emp-1', shopId: 'shop-new' },
            { employeeId: 'emp-2', shopId: 'shop-new' }
          ]
        },
        user: { _id: 'operator-1', name: 'Usman', role: 'ATTENDANCE_OPERATOR' }
      }, res);
      assert.equal(res.body.count, 1);
      assert.equal(res.body.lockedCount, 1);
      assert.equal(savedData.shop, 'shop-new');
      assert.equal(savedData.dailyWage, 99);
      assert.equal(Object.hasOwn(res.body.records[0], 'attendancePay'), false);
      assert.deepEqual(auditEvents.map(event => event.action), ['ATTENDANCE_EDITED', 'ATTENDANCE_BATCH_SAVED']);
    });

    await testAsync('one attendance batch stores each worker under their individually selected shop', async () => {
      auditEvents.length = 0;
      const employees = {
        'emp-1': { _id: 'emp-1', name: 'Alex Worker', employeeId: 'EMP-01', employmentStatus: 'Active', dailyWage: 120 },
        'emp-2': { _id: 'emp-2', name: 'Sam Worker', employeeId: 'EMP-02', employmentStatus: 'Active', dailyWage: 110 }
      };
      const shops = {
        'shop-a': { _id: 'shop-a', name: 'North Shop', status: 'Active', isActive: true },
        'shop-b': { _id: 'shop-b', name: 'South Shop', status: 'Active', isActive: true }
      };
      const storedRecords = [];
      replaceMethod(Employee, 'findById', async id => employees[id], restores);
      replaceMethod(Shop, 'findById', async id => shops[id], restores);
      replaceMethod(Attendance, 'findOne', async () => null, restores);
      replaceMethod(SystemSetting, 'findOne', async () => null, restores);
      replaceMethod(Attendance, 'findOneAndUpdate', async (filter, data) => {
        storedRecords.push({ employeeId: filter.employee, shopId: data.shop, shopName: data.shopName });
        return { _id: `att-${filter.employee}`, ...data };
      }, restores);
      const res = responseRecorder();
      await attendanceController.saveAttendanceBatch({
        body: {
          date: '2026-04-05',
          records: [
            { employeeId: 'emp-1', shopId: 'shop-a' },
            { employeeId: 'emp-2', shopId: 'shop-b' }
          ]
        },
        user: { _id: 'operator-1', name: 'Usman', role: 'ATTENDANCE_OPERATOR' }
      }, res);
      assert.equal(res.body.success, true);
      assert.equal(res.body.count, 2);
      assert.deepEqual(storedRecords, [
        { employeeId: 'emp-1', shopId: 'shop-a', shopName: 'North Shop' },
        { employeeId: 'emp-2', shopId: 'shop-b', shopName: 'South Shop' }
      ]);
      assert.deepEqual(res.body.records.map(record => record.shopName), ['North Shop', 'South Shop']);
    });

    await testAsync('batch rejects a worker without a selected shop before saving anything', async () => {
      let employeeLookupCount = 0;
      replaceMethod(Employee, 'findById', async () => {
        employeeLookupCount += 1;
        return { _id: 'emp-1', name: 'Alex Worker', employmentStatus: 'Active' };
      }, restores);
      const res = responseRecorder();
      await attendanceController.saveAttendanceBatch({
        body: {
          date: '2026-04-05',
          records: [{ employeeId: 'emp-1' }]
        },
        user: { _id: 'operator-1', name: 'Usman', role: 'ATTENDANCE_OPERATOR' }
      }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(employeeLookupCount, 0);
      assert.match(res.body.message, /shop where they worked/i);
    });

    await testAsync('absent attendance requires no shop or time fields and stores no shop assignment', async () => {
      const employee = {
        _id: 'emp-absent',
        name: 'Absent Worker',
        employeeId: 'EMP-ABSENT',
        employmentStatus: 'Active',
        dailyWage: 100
      };
      let savedData;
      replaceMethod(Employee, 'findById', async () => employee, restores);
      replaceMethod(Shop, 'findById', async () => assert.fail('Absent attendance must not look up a shop'), restores);
      replaceMethod(Attendance, 'findOne', async () => null, restores);
      replaceMethod(SystemSetting, 'findOne', async () => null, restores);
      replaceMethod(Attendance, 'findOneAndUpdate', async (filter, data) => {
        savedData = data;
        return { _id: 'att-absent', ...data };
      }, restores);
      const res = responseRecorder();
      await attendanceController.saveAttendanceBatch({
        body: {
          date: '2026-04-05',
          records: [{
            employeeId: 'emp-absent',
            status: 'Absent',
            shopId: 'must-be-ignored',
            timeReached: '09:15',
            workerEndTime: '17:00'
          }]
        },
        user: { _id: 'operator-1', name: 'Usman', role: 'ATTENDANCE_OPERATOR' }
      }, res);

      assert.equal(res.body.success, true);
      assert.equal(res.body.count, 1);
      assert.equal(savedData.status, 'Absent');
      assert.equal(savedData.shop, null);
      assert.equal(savedData.shopName, 'Absent');
      assert.equal(savedData.shiftStart, '');
      assert.equal(savedData.shiftEnd, '');
      assert.equal(savedData.timeReached, '');
      assert.equal(savedData.workerEndTime, '');
      assert.equal(savedData.scheduledHours, 0);
      assert.equal(res.body.records[0].shop, null);
      assert.equal(res.body.records[0].timeReached, '');
      assert.equal(res.body.records[0].workerEndTime, '');
      assert.match(res.body.message, /0 shops; 1 absent/);
    });

    await testAsync('operator cannot edit checked attendance', async () => {
      replaceMethod(Attendance, 'findById', async () => ({
        _id: 'att-checked', approvalStatus: 'Checked',
        save: async () => assert.fail('checked attendance must not be saved')
      }), restores);
      const res = responseRecorder();
      await attendanceController.updateAttendanceRecord({
        params: { id: 'att-checked' },
        body: { remarks: 'attempted edit' },
        user: { _id: 'operator-1', name: 'Usman', role: 'ATTENDANCE_OPERATOR' }
      }, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
    });

    await testAsync('checker verification changes only pending records and audits each record', async () => {
      auditEvents.length = 0;
      let selectedFields;
      let updateFilter;
      replaceMethod(Attendance, 'find', query => ({
        select: async fields => {
          assert.deepEqual(query.approvalStatus, { $in: ['Pending Review', 'Draft', 'Saved'] });
          selectedFields = fields;
          return [{ _id: 'att-pending', employeeName: 'Alex Worker', shopName: 'New Shop', dateString: '2026-04-05' }];
        }
      }), restores);
      replaceMethod(Attendance, 'updateMany', async (filter) => {
        updateFilter = filter;
        return { modifiedCount: 1 };
      }, restores);
      const res = responseRecorder();
      await attendanceController.approveAttendance({
        body: { ids: ['att-pending', 'att-checked'] },
        params: {},
        user: { _id: 'checker-1', name: 'Sarfraz', role: 'ATTENDANCE_CHECKER' }
      }, res);
      assert.equal(selectedFields, '_id employeeName employeeId shopName dateString');
      assert.deepEqual(updateFilter, { _id: { $in: ['att-pending'] } });
      assert.equal(res.body.modifiedCount, 1);
      assert.deepEqual(auditEvents.map(event => [event.action, event.recordId]), [['ATTENDANCE_CHECKED', 'att-pending']]);
    });

    await testAsync('PDF attendance export is read-only and contains no financial fields or values', async () => {
      auditEvents.length = 0;
      const absentFixture = {
        ...financeFixture,
        _id: 'att-absent-report',
        employeeName: 'Absent Worker',
        employeeId: 'EMP-ABSENT',
        shopName: 'SHOULD NOT BE ATTACHED TO ABSENT WORKER',
        shiftStart: '08:00',
        shiftEnd: '23:00',
        timeReached: '11:11',
        workerEndTime: '22:22',
        status: 'Absent'
      };
      replaceMethod(Attendance, 'find', () => ({
        sort: async () => [
          financeFixture,
          absentFixture,
          ...Array.from({ length: 30 }, (_, index) => ({
            ...financeFixture,
            _id: `att-worker-${index}`,
            employeeName: `Worker ${index + 1}`
          }))
        ]
      }), restores);
      replaceMethod(Shop, 'findById', async () => null, restores);
      const res = new CaptureResponse();
      const finish = new Promise((resolve, reject) => {
        res.once('finish', resolve);
        res.once('error', reject);
      });
      await reportController.exportDailyAttendancePDF({
        query: { date: '2026-04-05' },
        user: { _id: 'checker-1', name: 'Sarfraz', role: 'ATTENDANCE_CHECKER' }
      }, res);
      await finish;
      const pdf = res.buffer.toString('latin1');
      const streams = [];
      const streamPattern = /stream\r?\n/g;
      let match;
      while ((match = streamPattern.exec(pdf))) {
        const end = pdf.indexOf('endstream', streamPattern.lastIndex);
        if (end < 0) break;
        const bytes = Buffer.from(pdf.slice(streamPattern.lastIndex, end).replace(/\r?\n$/, ''), 'latin1');
        try {
          streams.push(inflateSync(bytes).toString('latin1'));
        } catch {
          streams.push(bytes.toString('latin1'));
        }
        streamPattern.lastIndex = end + 'endstream'.length;
      }
      const content = streams.join('\n') + pdf;
      const extractedText = content.replace(/\[([\s\S]*?)\]\s*TJ/g, (_, tokens) =>
        [...tokens.matchAll(/<([0-9a-f]+)>/gi)].map((token) => Buffer.from(token[1], 'hex').toString('latin1')).join('')
      );
      assert.match(res.headers['content-disposition'], /PIXX_Attendance_All-Shops_2026-04-05\.pdf/);
      assert.match(extractedText, /Daily Workforce Attendance/);
      assert.match(extractedText, /ABSENT \/ OFF DUTY/);
      assert.match(extractedText, /Not Assigned/);
      assert.match(extractedText, /Absent Worker/);
      assert.match(extractedText, /CONTINUED/);
      assert.match(extractedText, /5:00 PM/);
      assert.equal(extractedText.includes('17:00'), false);
      for (const value of ['SHOULD NOT BE ATTACHED', '08:00', '23:00', '11:11', '22:22']) {
        assert.equal(extractedText.includes(value), false, `${value} must not appear for an absent worker`);
      }
      assert.ok((pdf.match(/\/Subtype\s*\/Image/g) || []).length >= 2, 'The PDF must embed both saved signature images.');
      assert.match(pdf, /\/MediaBox \[0 0 595\.28 841\.89\]/);
      for (const value of ['987.65', '123.45', '12.34', '975.31', 'Wage', 'Deduction', 'Attendance Pay']) {
        assert.equal(extractedText.includes(value), false, `${value} must not appear in the PDF`);
      }
      assert.equal(auditEvents.some(event => event.action === 'REPORT_EXPORTED_PDF'), true);
      assert.equal(auditEvents.some(event => event.action === 'ATTENDANCE_EDITED'), false);
    });

    console.log(`\n${passed} attendance-role checks passed.`);
  } finally {
    for (const restore of restores.reverse()) restore();
    audit.logAction = originalLogAction;
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
