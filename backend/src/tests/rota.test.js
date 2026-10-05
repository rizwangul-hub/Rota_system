const assert = require('assert');
const {
  isDateKey, getWeek, dateInWeek, minutes, validateIntervals, validatePayload,
  findDuplicateEmployeeDates, getEmployeeDayAssignments, createAiRosterContext, resolveAiAssignments
} = require('../utils/rota');
const WeeklyRota = require('../models/WeeklyRota');
const RotaAvailability = require('../models/RotaAvailability');
const RotaAssignmentClaim = require('../models/RotaAssignmentClaim');

assert.strictEqual(isDateKey('2026-09-28'), true);
assert.strictEqual(isDateKey('2026-02-30'), false);
assert.strictEqual(isDateKey('2026-9-28'), false);
assert.deepStrictEqual(getWeek('2026-09-27'), { weekStart: '2026-09-27', weekEnd: '2026-10-03' });
assert.throws(() => getWeek('2026-09-28'), /Sunday/);
assert.throws(() => getWeek('not-a-date'), /valid YYYY-MM-DD/);
assert.strictEqual(dateInWeek('2026-10-03', '2026-09-27'), true);
assert.strictEqual(dateInWeek('2026-10-04', '2026-09-27'), false);
assert.strictEqual(minutes('23:59'), 1439);
assert.strictEqual(minutes('24:00'), null);
assert.strictEqual(validateIntervals([{ startTime: '09:00', endTime: '17:00' }]), null);
assert.strictEqual(validateIntervals([{ startTime: '09:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:00' }]), null);
assert.match(validateIntervals([{ startTime: '09:00', endTime: '13:00' }, { startTime: '12:00', endTime: '17:00' }]), /must not overlap/);
assert.match(validateIntervals([{ startTime: '17:00', endTime: '09:00' }]), /endTime after startTime/);
assert.strictEqual(validatePayload([], [], 'MANUAL'), null);
assert.match(validatePayload([], [], 'FAKE'), /generationMethod/);
assert.match(validatePayload([], [
  { shopId: 'shop', dateKey: '2026-09-27', targetWorkers: 1 },
  { shopId: 'shop', dateKey: '2026-09-27', targetWorkers: 2 }
], 'MANUAL'), /Only one staffing target/);
assert.deepStrictEqual(findDuplicateEmployeeDates([
  { employeeId: 'worker', dateKey: '2026-09-28', shopId: 'shop-a' },
  { employeeId: 'worker', dateKey: '2026-09-28', shopId: 'shop-a' },
  { employeeId: 'worker', dateKey: '2026-09-29', shopId: 'shop-b' }
]), []);
assert.deepStrictEqual(findDuplicateEmployeeDates([
  { employeeId: 'worker', dateKey: '2026-10-04', shopId: 'southwark', homeShopId: 'southwark', status: 'AVAILABLE' },
  { employeeId: 'worker', dateKey: '2026-10-04', shopId: 'southwark', homeShopId: 'southwark', status: 'CUSTOM' }
]), [], 'Repeated assignments at the same working shop are not cross-shop conflicts.');
assert.deepStrictEqual(findDuplicateEmployeeDates([
  ...['2026-10-04', '2026-10-05', '2026-10-06'].flatMap(dateKey => [
    { employeeId: 'shahzad', dateKey, shopId: 'southwark', homeShopId: 'southwark', status: 'AVAILABLE' },
    { employeeId: 'shahzad', dateKey, shopId: 'southwark', homeShopId: 'southwark', status: 'AVAILABLE' }
  ]),
  { employeeId: 'zamad', dateKey: '2026-10-10', shopId: 'camden', homeShopId: 'camden', status: 'AVAILABLE' },
  { employeeId: 'zamad', dateKey: '2026-10-10', shopId: 'camden', homeShopId: 'camden', status: 'AVAILABLE' }
]), [], 'Duplicate rows at only Southwark or Camden must not block saving as conflicts.');
assert.deepStrictEqual(findDuplicateEmployeeDates([
  { employeeId: 'worker', dateKey: '2026-10-04', shopId: 'station', homeShopId: 'station', status: 'OFF' },
  { employeeId: 'worker', dateKey: '2026-10-04', shopId: 'camden', homeShopId: 'camden', status: 'AVAILABLE' }
]), [], 'An OFF marker at the home shop plus a working assignment elsewhere is not a conflict.');
assert.deepStrictEqual(findDuplicateEmployeeDates([
  { employeeId: 'worker', dateKey: '2026-10-04', shopId: 'camden', homeShopId: 'station', status: 'LOANED' },
  { employeeId: 'worker', dateKey: '2026-10-04', shopId: 'camden', homeShopId: 'camden', status: 'AVAILABLE' }
]), [], 'The source and destination entries for one transfer represent one working assignment.');
assert.deepStrictEqual(findDuplicateEmployeeDates([
  { employeeId: 'worker', dateKey: '2026-10-04', shopId: 'station', homeShopId: 'station', status: 'AVAILABLE' },
  { employeeId: 'worker', dateKey: '2026-10-04', shopId: 'camden', homeShopId: 'camden', status: 'AVAILABLE' }
]), [{
  employeeId: 'worker',
  dateKey: '2026-10-04',
  shopIds: ['station', 'camden']
}], 'Assignments at different working shops on the same day are returned as a conflict.');
const transferAssignments = getEmployeeDayAssignments([
  {
    employeeId: 'worker',
    homeShopId: 'station',
    shopId: 'station',
    dateKey: '2026-10-04',
    status: 'OFF',
    note: 'At Camden'
  },
  {
    employeeId: 'worker',
    homeShopId: 'camden',
    shopId: 'camden',
    dateKey: '2026-10-04',
    status: 'AVAILABLE'
  },
  {
    employeeId: 'worker',
    homeShopId: 'station',
    shopId: 'station',
    dateKey: '2026-10-05',
    status: 'OFF'
  }
], { station: 'Station', camden: 'Camden' });
assert.deepStrictEqual(transferAssignments.get('worker:2026-10-04'), {
  status: 'WORKING',
  shopId: 'camden',
  shopName: 'Camden'
}, 'A destination-shop assignment takes precedence over the source-shop OFF marker.');
assert.deepStrictEqual(transferAssignments.get('worker:2026-10-05'), {
  status: 'OFF'
}, 'An actual day off remains OFF when there is no assignment at another shop.');
const reversedTransferAssignments = getEmployeeDayAssignments([
  {
    employeeId: 'worker',
    homeShopId: 'camden',
    shopId: 'camden',
    dateKey: '2026-10-04',
    status: 'AVAILABLE'
  },
  {
    employeeId: 'worker',
    homeShopId: 'station',
    shopId: 'station',
    dateKey: '2026-10-04',
    status: 'OFF'
  }
], { station: 'Station', camden: 'Camden' });
assert.deepStrictEqual(reversedTransferAssignments.get('worker:2026-10-04'), {
  status: 'WORKING',
  shopId: 'camden',
  shopName: 'Camden'
}, 'OFF markers must not overwrite a working shop regardless of assignment order.');
assert.match(validatePayload([{ employeeId: 'a', shopId: 'b', dateKey: '2026-09-27', startTime: '09:00', endTime: '09:00' }], [], 'MANUAL'), /valid startTime and endTime/);
assert(WeeklyRota.schema.path('assignments'), 'Weekly rota stores assignments independently.');
assert(WeeklyRota.schema.path('publishedVersions'), 'Published rota versions are preserved.');
assert.strictEqual(WeeklyRota.schema.path('attendance'), undefined, 'Rota documents do not contain attendance fields.');
assert.strictEqual(WeeklyRota.schema.path('salaryPayment'), undefined, 'Rota documents do not contain payroll fields.');
assert(RotaAvailability.schema.indexes().some(([keys, options]) =>
  keys.employeeId === 1 && keys.dateKey === 1 && options.unique === true
), 'Availability has a unique employee/date index.');
assert(RotaAssignmentClaim.schema.indexes().some(([keys, options]) =>
  keys.employeeId === 1 && keys.dateKey === 1 && options.unique === true
), 'Published assignments have a unique employee/date claim index.');

const employeeId = '64d000000000000000000001';
const shopId = '64d000000000000000000002';
const aiContext = createAiRosterContext(
  [{ _id: employeeId, name: 'Shiva', employeeId: 'PIXX001' }],
  [{ _id: shopId, name: 'Station Cycles', code: 'STAT' }],
  'Schedule Shiva at Station Cycles. Do not include PIXX001.'
);
assert(!aiContext.sanitizedInstruction.includes('Shiva'));
assert(!aiContext.sanitizedInstruction.includes('PIXX001'));
assert(aiContext.sanitizedInstruction.includes('Station Cycles'));
assert(!JSON.stringify(aiContext.employeeOptions).includes(employeeId));
assert(!JSON.stringify(aiContext.employeeOptions).includes('Shiva'));
assert.deepStrictEqual(resolveAiAssignments([{
  workerKey: 'worker-1',
  shopKey: 'shop-1',
  dateKey: '2026-09-27',
  startTime: '09:00',
  endTime: '17:00'
}], aiContext), [{
  employeeId,
  shopId,
  dateKey: '2026-09-27',
  startTime: '09:00',
  endTime: '17:00'
}]);
assert.throws(() => resolveAiAssignments([{
  workerKey: employeeId,
  shopKey: shopId,
  dateKey: '2026-09-27',
  startTime: '09:00',
  endTime: '17:00'
}], aiContext), /unknown employee or shop/);
const ambiguousContext = createAiRosterContext(
  [{ _id: 'worker-a', name: 'Sam' }, { _id: 'worker-b', name: 'Sam' }],
  [],
  'Sam needs a shift and the same opening time.'
);
assert(ambiguousContext.sanitizedInstruction.includes('an employee with an ambiguous name'));
assert(ambiguousContext.sanitizedInstruction.includes('the same opening time'));

console.log('Rota date, week, availability, and payload validation tests passed.');
