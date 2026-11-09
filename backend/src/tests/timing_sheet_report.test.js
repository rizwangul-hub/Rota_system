const assert = require('node:assert/strict');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../backend/.env') });
const connectDB = require('../config/db');
const reportController = require('../controllers/reportController');
const { Writable } = require('node:stream');
const ExcelJS = require('exceljs');

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
  status(code) {
    this.statusCode = code;
    return this;
  }
  send(payload) {
    if (Buffer.isBuffer(payload)) {
      this.parts.push(payload);
    } else if (typeof payload === 'string') {
      this.parts.push(Buffer.from(payload));
    }
    this.emit('finish');
    return this;
  }
  json(data) {
    this.jsonData = data;
    this.emit('finish');
    return this;
  }
  get buffer() {
    return Buffer.concat(this.parts);
  }
}

async function run() {
  await connectDB();
  console.log('Testing Timing Sheet Report...');

  // 1. Test JSON endpoint
  const jsonRes = new CaptureResponse();
  const jsonFinished = new Promise(resolve => jsonRes.once('finish', resolve));
  await reportController.getTimingSheetReport({
    query: { date: '2026-11-09' },
    user: { _id: '6ab77be36665c93c42332301', name: 'Admin', role: 'ADMIN' }
  }, jsonRes);
  await jsonFinished;

  assert.ok(jsonRes.jsonData, 'Must return JSON data');
  assert.equal(jsonRes.jsonData.success, true);
  assert.equal(jsonRes.jsonData.dates.length, 7, 'Must return 7 days (Sun-Sat)');
  assert.ok(Array.isArray(jsonRes.jsonData.shopsData), 'Must have shopsData array');
  console.log(`✓ PASS: JSON report returned ${jsonRes.jsonData.shopsData.length} shops with ${jsonRes.jsonData.summary?.totalWorkers || 0} total workers.`);

  // 2. Test Excel Export
  const excelRes = new CaptureResponse();
  const excelFinished = new Promise(resolve => excelRes.once('finish', resolve));
  await reportController.exportTimingSheetExcel({
    query: { date: '2026-11-09' },
    user: { _id: '6ab77be36665c93c42332301', name: 'Admin', role: 'ADMIN' }
  }, excelRes);
  await excelFinished;

  assert.ok(excelRes.buffer.length > 1000, 'Excel buffer must not be empty');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excelRes.buffer);
  const sheet = workbook.getWorksheet('Timing UK Sales Staff');
  assert.ok(sheet, 'Must contain Timing UK Sales Staff worksheet');
  assert.equal(sheet.getCell('A1').value, 'Timing UK Sales Staff');
  console.log(`✓ PASS: Excel export generated successfully (${excelRes.buffer.length} bytes, sheet: "${sheet.name}").`);

  // 3. Test PDF Export
  const pdfRes = new CaptureResponse();
  const pdfFinished = new Promise(resolve => pdfRes.once('finish', resolve));
  await reportController.exportTimingSheetPDF({
    query: { date: '2026-11-09' },
    user: { _id: '6ab77be36665c93c42332301', name: 'Admin', role: 'ADMIN' }
  }, pdfRes);
  await pdfFinished;

  assert.ok(pdfRes.buffer.length > 1000, 'PDF buffer must not be empty');
  assert.equal(pdfRes.buffer.subarray(0, 4).toString('ascii'), '%PDF', 'Must start with %PDF');
  console.log(`✓ PASS: PDF export generated successfully (${pdfRes.buffer.length} bytes).`);

  console.log('ALL TIMING SHEET BACKEND TESTS PASSED!');
  process.exit(0);
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
