const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../backend/.env') });
const connectDB = require('../config/db');
const rotaController = require('../controllers/rotaController');
const { Writable } = require('node:stream');
const zlib = require('node:zlib');

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

function pdfDecodedText(pdf) {
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
  return tokens.join('');
}

async function test() {
  await connectDB();
  const res = new CaptureResponse();
  const finished = new Promise((resolve, reject) => {
    res.once('finish', resolve);
    res.once('error', reject);
  });

  await rotaController.exportPdf({
    method: 'GET',
    params: { weekStart: '2026-11-08' },
    user: { _id: '64d000000000000000000001', role: 'ADMIN', name: 'Test' }
  }, res);
  await finished;

  const rawText = pdfDecodedText(res.buffer);
  const normalized = rawText.replace(/\s+/g, ' ');
  const lbIdx = normalized.lastIndexOf('LeebridgeName');
  console.log('=== EXACT LEEBRIDGE TABLE IN PDF ===');
  console.log(normalized.slice(lbIdx, lbIdx + 700));
  process.exit(0);
}
test().catch(err => {
  console.error(err);
  process.exit(1);
});
