const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const audit = require('../utils/audit');

audit.logAction = async () => {};

const Employee = require('../models/Employee');
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

async function run() {
  const restores = [];
  const replaceMethod = (target, key, replacement) => {
    const original = target[key];
    target[key] = replacement;
    restores.push(() => { target[key] = original; });
  };

  try {
    const shopId = '64d000000000000000000001';
    const employeeId = '64d000000000000000000002';
    replaceMethod(WeeklyRota, 'findOne', () => {
      assert.fail('PDF snapshot export must not read the saved rota.');
    });
    replaceMethod(Shop, 'find', () => ({
      select: () => ({
        lean: async () => [{ _id: shopId, name: 'Snapshot Shop' }]
      })
    }));
    replaceMethod(Employee, 'find', () => ({
      select: () => ({
        lean: async () => [{ _id: employeeId, name: 'Screen Snapshot Worker' }]
      })
    }));

    const response = new CaptureResponse();
    const finished = new Promise((resolve, reject) => {
      response.once('finish', resolve);
      response.once('error', reject);
    });
    await rotaController.exportPdf({
      method: 'POST',
      params: { weekStart: '2026-10-04' },
      body: {
        generationMethod: 'MANUAL',
        shopRoster: [{ shopId, employeeIds: [employeeId] }],
        assignments: [{
          employeeId,
          shopId,
          homeShopId: shopId,
          dateKey: '2026-10-04',
          startTime: '09:00',
          endTime: '17:00',
          status: 'AVAILABLE'
        }]
      },
      user: { _id: '64d000000000000000000003', role: 'ADMIN' }
    }, response);
    await finished;

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/pdf');
    assert.equal(response.buffer.subarray(0, 4).toString('ascii'), '%PDF');
    assert.ok(response.buffer.length > 1000);
    console.log('PASS weekly rota PDF is rendered from the current screen snapshot');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
