const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const zlib = require('node:zlib');
const {
  buildWeeklyAttendanceExcel,
  buildWeeklySalaryDailyBreakdown,
  buildWeeklySalaryExcel,
  buildWeeklySalaryPDF
} = require('../utils/reports');
const Attendance = require('../models/Attendance');
const WeeklySalary = require('../models/WeeklySalary');
const reportController = require('../controllers/reportController');

function extractPdfHexText(buffer) {
  const decoded = [];
  for (const stream of buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content;
    try {
      content = zlib.inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const match of content.matchAll(/<([0-9a-f]+)>/gi)) {
      decoded.push(Buffer.from(match[1], 'hex').toString('latin1'));
    }
  }
  return decoded.join('');
}

async function run() {
  const salary = {
    employeeName: 'Test Worker',
    shopName: 'Station',
    weekLabel: '04/10/2026 – 10/10/2026',
    netAttendancePay: 300,
    attendanceBreakdown: [
      { dateString: '2026-10-04', status: 'Present', attendancePay: 50 },
      { dateString: '2026-10-05', status: 'Late', attendancePay: 45 },
      { dateString: '2026-10-06', status: 'Present', attendancePay: 50 },
      { dateString: '2026-10-07', status: 'Present', attendancePay: 50 },
      { dateString: '2026-10-08', status: 'Present', attendancePay: 50 },
      { dateString: '2026-10-09', status: 'Present', attendancePay: 50 },
      { dateString: '2026-10-10', status: 'Half', attendancePay: 5 }
    ]
  };

  const dailyBreakdown = buildWeeklySalaryDailyBreakdown(salary, '2026-10-04');
  assert.equal(dailyBreakdown.length, 7);
  assert.equal(dailyBreakdown[0].dateString, '2026-10-04');
  assert.equal(dailyBreakdown[6].dayOfWeek, 'Sat');
  assert.equal(dailyBreakdown[6].attendancePay, 5);
  assert.equal(dailyBreakdown.reduce((sum, day) => sum + day.attendancePay, 0), salary.netAttendancePay);

  const incompleteWeek = buildWeeklySalaryDailyBreakdown({
    attendanceBreakdown: salary.attendanceBreakdown.slice(0, 6)
  }, '2026-10-04');
  assert.equal(incompleteWeek.length, 7);
  assert.equal(incompleteWeek[6].dateString, '2026-10-10');
  assert.equal(incompleteWeek[6].attendancePay, 0);
  assert.equal(incompleteWeek[6].status, '');

  const restoredSaturday = buildWeeklySalaryDailyBreakdown({
    weekStartDateString: '2026-09-27',
    attendanceBreakdown: [{ dateString: '2026-09-27', status: 'Present', attendancePay: 50 }],
    reportAttendanceBreakdown: [
      { dateString: '2026-10-03', status: 'Present', attendancePay: 50 }
    ]
  }, '2026-09-27');
  assert.equal(restoredSaturday[6].dateString, '2026-10-03');
  assert.equal(restoredSaturday[6].attendancePay, 50);
  assert.equal(restoredSaturday[6].status, 'Present');

  const workbook = await buildWeeklySalaryExcel([salary], salary.weekLabel, {}, '2026-10-04');
  const sheet = workbook.getWorksheet('Weekly Salary');
  assert.equal(sheet.getRow(3).getCell(1).value, 'Employee Name');
  assert.equal(sheet.getRow(3).getCell(9).value, 'Sat 2026-10-10');
  assert.equal(sheet.getRow(4).getCell(9).value, 5);
  assert.equal(sheet.getRow(6).getCell(9).value, 5);
  assert.equal(sheet.getRows(1, sheet.rowCount).some(row => row.values.includes('Station')), false);

  const roundTrip = new ExcelJS.Workbook();
  await roundTrip.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(roundTrip.getWorksheet('Weekly Salary').getRow(3).getCell(9).value, 'Sat 2026-10-10');

  const attendanceWorkbook = await buildWeeklyAttendanceExcel([{
    employeeName: 'Test Worker',
    shopName: 'Station',
    dailySchedule: { Sun: 'Station', Mon: 'Camden' },
    workingDays: 2,
    actualHours: 16
  }], 'Week');
  const attendanceSheet = attendanceWorkbook.getWorksheet('Weekly Attendance');
  assert.equal(attendanceSheet.getRow(3).getCell(1).value, 'Employee Name');
  assert.equal(attendanceSheet.getRow(3).getCell(2).value, 'Sun');
  assert.equal(attendanceSheet.getRow(4).getCell(1).value, 'Test Worker');
  assert.equal(attendanceSheet.getRow(4).getCell(2).value, 'Station');
  assert.equal(attendanceSheet.getRow(4).getCell(3).value, 'Camden');

  const pdf = await buildWeeklySalaryPDF(null, [salary], salary.weekLabel, {}, 'Admin', '2026-10-04');
  const pdfText = extractPdfHexText(pdf);
  assert.ok(pdf.subarray(0, 4).toString('ascii') === '%PDF');
  assert.ok(pdfText.includes('Sat 10 Oct'));
  assert.ok(pdfText.includes('£5.00'));
  assert.equal(pdfText.includes('Station'), false);

  const originalSalaryFind = WeeklySalary.find;
  const originalAttendanceFind = Attendance.find;
  const queryResult = records => ({
    populate() { return this; },
    sort() { return Promise.resolve(records); }
  });
  const salaryRecord = {
    employee: { _id: 'worker-1', name: 'Test Worker' },
    employeeName: 'Test Worker',
    shopName: 'Station',
    weekLabel: '27/09/2026 – 03/10/2026',
    weekStartDateString: '2026-09-27',
    netAttendancePay: 300,
    finalSalary: 300,
    totalPaid: 0,
    balanceRemaining: 300,
    status: 'Generated',
    attendanceBreakdown: Array.from({ length: 6 }, (_, index) => {
      const date = new Date('2026-09-27T12:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index);
      return {
        dateString: date.toISOString().slice(0, 10),
        status: 'Present',
        attendancePay: 50
      };
    })
  };
  WeeklySalary.find = () => queryResult([salaryRecord]);
  Attendance.find = () => queryResult([{
    employee: { _id: 'worker-1' },
    dateString: '2026-10-03',
    shopName: 'Station',
    status: 'Present',
    attendancePay: 50
  }]);
  try {
    const response = { json(data) { this.data = data; } };
    await reportController.getWeeklySalaryReport({ query: { date: '2026-10-03' } }, response);
    assert.equal(response.data.salaries[0].dailyAttendance.length, 7);
    assert.equal(response.data.salaries[0].dailyAttendance[6].dateString, '2026-10-03');
    assert.equal(response.data.salaries[0].dailyAttendance[6].attendancePay, 50);
    assert.equal(response.data.salaries[0].dailyAttendance[6].status, 'Present');
    assert.equal(response.data.totals.dailyAttendance[6].attendancePay, 50);
    assert.equal(response.data.salaries[0].netAttendancePay, 350);
    assert.equal(response.data.salaries[0].finalSalary, 350);
    assert.equal(response.data.salaries[0].balanceRemaining, 350);
    assert.equal(response.data.totals.totalAttendancePay, 350);
    assert.equal(response.data.totals.totalFinalSalary, 350);

    salaryRecord.weeklySalaryOverride = 425;
    await reportController.getWeeklySalaryReport({ query: { date: '2026-10-03' } }, response);
    assert.equal(response.data.salaries[0].netAttendancePay, 425);
    assert.equal(response.data.salaries[0].finalSalary, 425);

    delete salaryRecord.weeklySalaryOverride;
    salaryRecord.finalizationSnapshot = { attendanceBreakdown: salaryRecord.attendanceBreakdown };
    await reportController.getWeeklySalaryReport({ query: { date: '2026-10-03' } }, response);
    assert.equal(response.data.salaries[0].netAttendancePay, 350);
    assert.equal(response.data.salaries[0].dailyAttendance[6].attendancePay, 50);

    salaryRecord.status = 'FINALIZED';
    await reportController.getWeeklySalaryReport({ query: { date: '2026-10-03' } }, response);
    assert.equal(response.data.salaries[0].netAttendancePay, 300);
    assert.equal(response.data.salaries[0].finalSalary, 300);
  } finally {
    WeeklySalary.find = originalSalaryFind;
    Attendance.find = originalAttendanceFind;
  }

  console.log('PASS weekly salary screen data, Excel and PDF include Sunday–Saturday wages, including Saturday');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
