const assert = require('assert');
const {
  sortDailyAttendanceRecords,
  getShopSequenceRank,
  sortDailyAttendancePdfRecords,
  getDailyAttendancePdfShopSequenceRank
} = require('../utils/reports');

// Test 1: Sequence ranks for general attendance approval
assert.strictEqual(getShopSequenceRank('Station Cycles'), 1);
assert.strictEqual(getShopSequenceRank('Camden Cycles'), 2);
assert.strictEqual(getShopSequenceRank('Chelsea Bikes'), 3);
assert.strictEqual(getShopSequenceRank('Edgware Cycles'), 4);
assert.strictEqual(getShopSequenceRank('Southwark Cycles'), 5);
assert.strictEqual(getShopSequenceRank('Leebridge Cycles'), 6);
assert.strictEqual(getShopSequenceRank('Leabridge Cycles'), 6);
assert.strictEqual(getShopSequenceRank('Labridge Cycles'), 6);

// Test 2: Sort attendance records matching user request
const mockRecords = [
  { employeeName: 'Worker 6', shopName: 'Leebridge Cycles', status: 'Present' },
  { employeeName: 'Worker 4', shopName: 'Edgware Cycles', status: 'Present' },
  { employeeName: 'Worker 1', shopName: 'Station Cycles', status: 'Present' },
  { employeeName: 'Worker 5', shopName: 'Southwark Cycles', status: 'Present' },
  { employeeName: 'Worker 2', shopName: 'Camden Cycles', status: 'Present' },
  { employeeName: 'Worker 3', shopName: 'Chelsea Bikes', status: 'Present' },
  { employeeName: 'Worker Absent', shopName: 'Station Cycles', status: 'Absent' }
];

const sorted = sortDailyAttendanceRecords(mockRecords);

assert.strictEqual(sorted[0].shopName, 'Station Cycles');
assert.strictEqual(sorted[1].shopName, 'Camden Cycles');
assert.strictEqual(sorted[2].shopName, 'Chelsea Bikes');
assert.strictEqual(sorted[3].shopName, 'Edgware Cycles');
assert.strictEqual(sorted[4].shopName, 'Southwark Cycles');
assert.strictEqual(sorted[5].shopName, 'Leebridge Cycles');
assert.strictEqual(sorted[6].status, 'Absent');

// Test 3: Daily Attendance PDF specific sequence:
// 1. Camden Cycles
// 2. Chelsea Cycles
// 3. Station Cycles (on number 3 between Chelsea and Edgware)
// 4. Edgware Cycles
// 5. Southwark Cycles
// 6. Leebridge Cycles
assert.strictEqual(getDailyAttendancePdfShopSequenceRank('Camden Cycles'), 1);
assert.strictEqual(getDailyAttendancePdfShopSequenceRank('Chelsea Cycles'), 2);
assert.strictEqual(getDailyAttendancePdfShopSequenceRank('Station Cycles'), 3);
assert.strictEqual(getDailyAttendancePdfShopSequenceRank('Edgware Cycles'), 4);
assert.strictEqual(getDailyAttendancePdfShopSequenceRank('Southwark Cycles'), 5);
assert.strictEqual(getDailyAttendancePdfShopSequenceRank('Leebridge Cycles'), 6);
assert.strictEqual(getDailyAttendancePdfShopSequenceRank('Labridge Cycles'), 6);
assert.strictEqual(getDailyAttendancePdfShopSequenceRank('Labidge Cycles'), 6);

const pdfSorted = sortDailyAttendancePdfRecords(mockRecords);
assert.strictEqual(pdfSorted[0].shopName, 'Camden Cycles');
assert.strictEqual(pdfSorted[1].shopName, 'Chelsea Bikes');
assert.strictEqual(pdfSorted[2].shopName, 'Station Cycles');
assert.strictEqual(pdfSorted[3].shopName, 'Edgware Cycles');
assert.strictEqual(pdfSorted[4].shopName, 'Southwark Cycles');
assert.strictEqual(pdfSorted[5].shopName, 'Leebridge Cycles');
assert.strictEqual(pdfSorted[6].status, 'Absent');

console.log('✅ Daily Attendance PDF sequence test passed! Order is: Camden -> Chelsea -> Station (#3) -> Edgware -> Southwark -> Leebridge -> Absent');
