const assert = require('assert');
const {
  isDateKey, getWeek, dateInWeek, minutes, validateIntervals, validatePayload
} = require('../utils/rota');

assert.strictEqual(isDateKey('2026-09-28'), true);
assert.strictEqual(isDateKey('2026-02-30'), false);
assert.strictEqual(isDateKey('2026-9-28'), false);
assert.deepStrictEqual(getWeek('2026-09-28'), { weekStart: '2026-09-28', weekEnd: '2026-10-04' });
assert.throws(() => getWeek('2026-09-27'), /Monday/);
assert.throws(() => getWeek('not-a-date'), /valid YYYY-MM-DD/);
assert.strictEqual(dateInWeek('2026-10-04', '2026-09-28'), true);
assert.strictEqual(dateInWeek('2026-10-05', '2026-09-28'), false);
assert.strictEqual(minutes('23:59'), 1439);
assert.strictEqual(minutes('24:00'), null);
assert.strictEqual(validateIntervals([{ startTime: '09:00', endTime: '17:00' }]), null);
assert.strictEqual(validateIntervals([{ startTime: '09:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:00' }]), null);
assert.match(validateIntervals([{ startTime: '09:00', endTime: '13:00' }, { startTime: '12:00', endTime: '17:00' }]), /must not overlap/);
assert.match(validateIntervals([{ startTime: '17:00', endTime: '09:00' }]), /endTime after startTime/);
assert.strictEqual(validatePayload([], [], 'MANUAL'), null);
assert.match(validatePayload([], [], 'FAKE'), /generationMethod/);
assert.match(validatePayload([{ employeeId: 'a', shopId: 'b', dateKey: '2026-09-27', startTime: '09:00', endTime: '09:00' }], [], 'MANUAL'), /valid startTime and endTime/);

console.log('Rota date, week, availability, and payload validation tests passed.');
