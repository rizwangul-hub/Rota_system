const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const zlib = require('node:zlib');
const ExcelJS = require('exceljs');
const audit = require('../utils/audit');

audit.logAction = async () => {};

const Shop = require('../models/Shop');
const WeeklyRota = require('../models/WeeklyRota');
const rotaController = require('../controllers/rotaController');

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

function pdfText(pdf) {
  const tokens = [];
  for (const stream of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content;
    try {
      content = zlib.inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const match of content.matchAll(/<([0-9a-f]+)>/gi)) {
      tokens.push(Buffer.from(match[1], 'hex').toString('latin1'));
    }
  }
  return tokens.join('').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function pdfStreams(pdf) {
  const streams = [];
  for (const stream of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      streams.push(zlib.inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1'));
    } catch {
      continue;
    }
  }
  return streams.join('\n');
}

function pdfFillColorOperator(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map(channel => String(parseInt(channel, 16) / 255));
  return `${channels.join(' ')} scn`;
}

async function run() {
  const restores = [];
  const replaceMethod = (target, key, replacement) => {
    const original = target[key];
    target[key] = replacement;
    restores.push(() => { target[key] = original; });
  };

  try {
    const homeShopId = '64d000000000000000000001';
    const targetShopId = '64d000000000000000000002';
    const employeeId = '64d000000000000000000003';
    const unavailableEmployeeId = '64d000000000000000000005';
    const weekDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date('2026-10-04T12:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    replaceMethod(WeeklyRota, 'findOne', () => ({
      populate: function () { return this; },
      lean: async () => ({
        assignments: [{
          employeeId,
          shopId: targetShopId,
          homeShopId,
          dateKey: '2026-10-04',
          startTime: '09:00',
          endTime: '17:00',
          status: 'LOANED'
        }, {
          employeeId,
          shopId: homeShopId,
          homeShopId,
          dateKey: '2026-10-05',
          startTime: '',
          endTime: '',
          status: 'OFF'
        }, ...weekDates.map(dateKey => ({
          employeeId: unavailableEmployeeId,
          shopId: homeShopId,
          homeShopId,
          dateKey,
          startTime: '',
          endTime: '',
          status: 'OFF'
        }))],
        shopRoster: [{
          shopId: { _id: homeShopId, name: 'Camden' },
          employeeIds: [
            { _id: employeeId, name: 'Saved Rota Worker' },
            { _id: unavailableEmployeeId, name: 'Unavailable Worker' }
          ]
        }]
      })
    }));
    replaceMethod(Shop, 'find', () => ({
      select: () => ({
        lean: async () => [
          { _id: homeShopId, name: 'Camden' },
          { _id: targetShopId, name: 'Station' }
        ]
      })
    }));

    const response = new CaptureResponse();
    const finished = new Promise((resolve, reject) => {
      response.once('finish', resolve);
      response.once('error', reject);
    });
    await rotaController.exportPdf({
      method: 'GET',
      params: { weekStart: '2026-10-04' },
      user: { _id: '64d000000000000000000004', role: 'ADMIN' }
    }, response);
    await finished;

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/pdf');
    assert.ok(response.buffer.subarray(0, 4).toString('ascii') === '%PDF');
    const extractedText = pdfText(response.buffer);
    const decodedStreams = pdfStreams(response.buffer);
    assert.ok(decodedStreams.includes(pdfFillColorOperator('#fcd34d')), 'Camden should have one continuous, visible shop background');
    assert.ok(decodedStreams.includes(pdfFillColorOperator('#93c5fd')), 'Station should have one continuous, visible shop background');
    assert.ok(!decodedStreams.includes(pdfFillColorOperator('#ecfdf5')), 'available cells should not be drawn as separate background boxes');
    assert.ok(!decodedStreams.includes(pdfFillColorOperator('#fef2f2')), 'OFF cells should not be drawn as separate background boxes');
    assert.ok(!extractedText.includes('unavailableworker'), 'workers unavailable at a shop for the entire week should not appear in its list');
    const targetShopIndex = extractedText.indexOf('station');
    assert.notEqual(targetShopIndex, -1);
    assert.ok(extractedText.slice(targetShopIndex).includes('savedrotaworker'), 'transferred workers should appear in the destination shop list');
    assert.ok(extractedText.slice(targetShopIndex).includes('total1'));

    const excelResponse = new CaptureResponse();
    const excelFinished = new Promise((resolve, reject) => {
      excelResponse.once('finish', resolve);
      excelResponse.once('error', reject);
    });
    await rotaController.exportExcel({
      params: { weekStart: '2026-10-04' },
      user: { _id: '64d000000000000000000004', role: 'ADMIN' }
    }, excelResponse);
    await excelFinished;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excelResponse.buffer);
    const sheet = workbook.getWorksheet('ROTA');
    const targetShopRow = [];
    sheet.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === 'Station') targetShopRow.push(rowNumber);
    });
    assert.equal(targetShopRow.length, 1);
    const totalRow = sheet.getRow(targetShopRow[0] + 4);
    assert.equal(totalRow.getCell(1).value, 'Total');
    assert.equal(totalRow.getCell(2).value, 1);
    assert.equal(sheet.getRow(targetShopRow[0] + 3).getCell(1).value, 'Saved Rota Worker');
    const unavailableWorkerRows = [];
    sheet.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === 'Unavailable Worker') unavailableWorkerRows.push(rowNumber);
    });
    assert.equal(unavailableWorkerRows.length, 0);
    console.log('PASS weekly rota PDF and Excel totals include transferred workers at destination shops');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
