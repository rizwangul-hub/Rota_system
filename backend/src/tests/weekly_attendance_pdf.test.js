const assert = require('node:assert/strict');
const { inflateSync } = require('node:zlib');
const { buildWeeklyAttendancePDF } = require('../utils/reports');

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(buffer) {
      this.buffer = buffer;
      return this;
    }
  };
}

function extractPdfText(pdf) {
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

  return (streams.join('\n') + pdf).replace(/\[([\s\S]*?)\]\s*TJ/g, (_, tokens) =>
    [...tokens.matchAll(/<([0-9a-f]+)>/gi)]
      .map(token => Buffer.from(token[1], 'hex').toString('latin1'))
      .join('')
  );
}

async function run() {
  const res = responseRecorder();
  await buildWeeklyAttendancePDF(res, [
    {
      employeeName: 'Alex Worker',
      dailySchedule: {
        Sun: 'Station Cycles',
        Mon: 'Camden Cycles',
        Tue: 'Off',
        Wed: 'Station Cycles',
        Thu: 'Off',
        Fri: 'Chelsea Bikes',
        Sat: 'Off'
      },
      workingDays: 3,
      actualHours: 24
    },
    {
      employeeName: 'Blake Worker',
      dailySchedule: {
        Sun: 'Off',
        Mon: 'Camden Cycles',
        Tue: 'Camden Cycles',
        Wed: 'Off',
        Thu: 'Off',
        Fri: 'Off',
        Sat: 'Off'
      },
      workingDays: 2,
      actualHours: 16
    }
  ], '27 Sep – 03 Oct 2026');

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.equal(res.buffer.subarray(0, 4).toString('ascii'), '%PDF');

  const text = extractPdfText(res.buffer.toString('latin1'));
  for (const value of ['Alex Worker', 'Blake Worker', 'Station Cycles', 'Camden Cycles', 'Chelsea Bikes']) {
    assert.equal(text.includes(value), true, `${value} should appear in the weekly PDF`);
  }
  assert.equal((text.match(/Alex Worker/g) || []).length, 1);
  assert.equal((text.match(/Blake Worker/g) || []).length, 1);
  assert.equal(text.includes('SUBTOTAL'), false);
  assert.equal(text.includes('Station Cycles CYCLES'), false);

  console.log('Weekly attendance PDF lists each worker once with the shop beside each working day.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
