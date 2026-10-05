const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const zlib = require('node:zlib');
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
        }],
        shopRoster: [{
          shopId: { _id: homeShopId, name: 'Home Shop' },
          employeeIds: [{ _id: employeeId, name: 'Saved Rota Worker' }]
        }]
      })
    }));
    replaceMethod(Shop, 'find', () => ({
      select: () => ({
        lean: async () => [
          { _id: homeShopId, name: 'Home Shop' },
          { _id: targetShopId, name: 'Target Shop' }
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
    assert.ok(pdfText(response.buffer).includes('targetshop'));
    console.log('PASS weekly rota PDF export includes saved assignment data');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
