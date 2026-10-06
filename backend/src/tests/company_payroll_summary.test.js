const assert = require('node:assert/strict');

const Attendance = require('../models/Attendance');
const Bonus = require('../models/Bonus');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const WeeklySalary = require('../models/WeeklySalary');
const reportController = require('../controllers/reportController');
const dashboardController = require('../controllers/dashboardController');
const { getUKDateString, getWeekRange } = require('../utils/calc');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

async function run() {
  const restores = [];
  const replaceMethod = (target, key, replacement) => {
    const original = target[key];
    target[key] = replacement;
    restores.push(() => { target[key] = original; });
  };

  try {
    const week = getWeekRange(getUKDateString());
    const camdenId = '64d000000000000000000001';
    const stationId = '64d000000000000000000002';
    const shops = [
      { _id: camdenId, name: 'Camden' },
      { _id: stationId, name: 'Station' }
    ];
    const salary = {
      shop: camdenId,
      weekStartDate: week.startDate,
      weekStartDateString: week.startDateString,
      weekEndDate: week.endDate,
      weekEndDateString: week.endDateString,
      status: 'FINALIZED',
      netAttendancePay: 350,
      travelAllowance: 35,
      otherAllowances: 0,
      manualDeductions: 0,
      finalSalary: 386,
      totalPaid: 100,
      balanceRemaining: 286,
      scheduledHours: 36,
      actualHours: 30,
      attendanceBreakdown: [
        { shopName: 'Station', attendancePay: 150, scheduledHours: 12, actualHours: 10 },
        { shopName: 'Camden', attendancePay: 200, scheduledHours: 24, actualHours: 20 }
      ]
    };
    const primaryShopFallbackSalary = {
      ...salary,
      shop: stationId,
      netAttendancePay: 50,
      travelAllowance: 0,
      finalSalary: 50,
      totalPaid: 0,
      balanceRemaining: 50,
      attendanceBreakdown: []
    };
    const attendance = [
      { shop: camdenId, status: 'Present', scheduledHours: 12, actualHours: 10 },
      { shop: camdenId, status: 'Late', scheduledHours: 12, actualHours: 10 },
      { shop: stationId, status: 'Present', scheduledHours: 12, actualHours: 10 }
    ];
    let capturedWeeklySalaryQuery;
    let capturedBonusQuery;

    replaceMethod(Employee, 'countDocuments', async () => 2);
    replaceMethod(Shop, 'countDocuments', async () => 2);
    replaceMethod(Attendance, 'countDocuments', async () => 0);
    replaceMethod(WeeklySalary, 'find', async query => {
      if (query.$or?.some(condition => condition.weekStartDateString)) {
        capturedWeeklySalaryQuery = query;
        return [salary, primaryShopFallbackSalary];
      }
      const weekEndDateStringRange = query.$or?.find(condition => condition.weekEndDateString)?.weekEndDateString;
      if (weekEndDateStringRange
        && salary.weekEndDateString >= weekEndDateStringRange.$gte
        && salary.weekEndDateString <= weekEndDateStringRange.$lte) return [salary, primaryShopFallbackSalary];
      return [];
    });
    replaceMethod(Bonus, 'find', async query => {
      capturedBonusQuery = query;
      return [];
    });
    replaceMethod(Shop, 'find', async () => shops);
    replaceMethod(Attendance, 'find', async query => {
      if (query.dateString) {
        return [
          { shop: camdenId, employee: 'worker-1', status: 'Present', scheduledHours: 8, actualHours: 8, attendancePay: 50 },
          { shop: camdenId, employee: 'worker-1', status: 'Late', scheduledHours: 0, actualHours: 0, attendancePay: 0 },
          { shop: stationId, employee: 'worker-2', status: 'Present', scheduledHours: 8, actualHours: 8, attendancePay: 50 }
        ];
      }
      assert.ok(query.$or.some(condition => condition.dateString));
      return attendance.filter(record => !query.shop || record.shop === query.shop.toString());
    });

    const allShopsResponse = responseRecorder();
    await reportController.getCompanyPayrollSummary({
      user: { role: 'ADMIN' },
      query: {}
    }, allShopsResponse);
    assert.equal(allShopsResponse.statusCode, 200);
    assert.equal(allShopsResponse.body.success, true);
    assert.equal(capturedWeeklySalaryQuery.$or.some(condition => condition.weekStartDateString === week.startDateString), true);
    assert.equal(Object.hasOwn(capturedWeeklySalaryQuery, 'shop'), false);
    assert.equal(Object.hasOwn(capturedBonusQuery, 'shop'), false);

    const summary = allShopsResponse.body;
    assert.equal(summary.cards.finalizedSalary, 436);
    assert.equal(summary.cards.totalPaid, 100);
    assert.equal(summary.cards.labourHours, 30);
    assert.deepEqual(capturedWeeklySalaryQuery.status.$in, [
      'FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'
    ]);
    assert.equal(summary.charts.salaryByShop.find(shop => shop.shopId === camdenId).amount, 220.57);
    assert.equal(summary.charts.salaryByShop.find(shop => shop.shopId === stationId).amount, 215.43);
    assert.equal(summary.charts.salaryByShop.reduce((total, shop) => total + shop.amount, 0), 436);
    assert.deepEqual(summary.charts.labourHoursByShop.map(shop => shop.actualHours), [20, 10]);
    assert.deepEqual(summary.charts.labourHoursByShop.map(shop => shop.scheduledHours), [24, 12]);
    assert.deepEqual(summary.charts.attendanceDistribution, { present: 2, late: 1, half: 0, absent: 0 });
    assert.equal(summary.charts.monthlySalaryTrend.reduce((total, month) => total + month.finalizedSalary, 0), 436);

    const filteredResponse = responseRecorder();
    await reportController.getCompanyPayrollSummary({
      user: { role: 'ADMIN' },
      query: { shopId: camdenId, weekLabel: week.weekLabel }
    }, filteredResponse);
    assert.equal(filteredResponse.statusCode, 200);
    assert.equal(filteredResponse.body.success, true);
    assert.equal(capturedWeeklySalaryQuery.$or.some(condition => condition.weekLabel?.$in?.includes(week.weekLabel)), true);
    assert.equal(String(capturedBonusQuery.shop), camdenId);
    assert.equal(filteredResponse.body.cards.finalizedSalary, 220.57);
    assert.deepEqual(filteredResponse.body.charts.salaryByShop.map(shop => shop.shopId), [camdenId]);
    assert.equal(filteredResponse.body.charts.monthlySalaryTrend.reduce((total, month) => total + month.finalizedSalary, 0), 220.57);

    const adminDashboardResponse = responseRecorder();
    await dashboardController.getAdminDashboard({}, adminDashboardResponse);
    assert.equal(adminDashboardResponse.body.success, true);
    assert.equal(adminDashboardResponse.body.data.thisWeekSalaryTotal, 436);
    assert.equal(adminDashboardResponse.body.data.shopBreakdown.find(shop => shop.shopId === camdenId).weekSalaryCost, 220.57);
    assert.equal(adminDashboardResponse.body.data.shopBreakdown.find(shop => shop.shopId === stationId).weekSalaryCost, 215.43);
    assert.equal(adminDashboardResponse.body.data.shopBreakdown.find(shop => shop.shopId === camdenId).todayWorkers, 1);
    assert.equal(adminDashboardResponse.body.data.shopBreakdown.find(shop => shop.shopId === camdenId).todayHours, 8);

    console.log('PASS executive dashboard calculations use current-week payroll and allocate multi-shop costs and hours correctly');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
