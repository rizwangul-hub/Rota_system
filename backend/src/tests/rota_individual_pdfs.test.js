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

  status(code) {
    this.statusCode = code;
    return this;
  }

  send(buffer) {
    this.end(buffer);
    return this;
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
    replaceMethod(WeeklyRota, 'findOne', () => ({
      lean: async () => ({
        assignments: [{
          employeeId,
          shopId,
          homeShopId: shopId,
          dateKey: '2026-10-04',
          startTime: '09:00',
          endTime: '17:00',
          status: 'AVAILABLE'
        }],
        shopRoster: [{ shopId, employeeIds: [employeeId] }]
      })
    }));
    replaceMethod(Shop, 'find', () => ({
      select: () => ({
        lean: async () => [{ _id: shopId, name: 'Camden' }]
      })
    }));
    replaceMethod(Employee, 'find', () => ({
      select: () => ({
        lean: async () => [{ _id: employeeId, name: 'Test Worker', employeeId: 'T-001' }]
      })
    }));

    const response = new CaptureResponse();
    const finished = new Promise((resolve, reject) => {
      response.once('finish', resolve);
      response.once('error', reject);
    });
    await rotaController.exportIndividualPdfs({
      params: { weekStart: '2026-10-04' },
      user: { _id: '64d000000000000000000003', role: 'ADMIN' }
    }, response);
    await finished;

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/zip');
    assert.equal(response.buffer.subarray(0, 2).toString('ascii'), 'PK');
    const archiveIndex = response.buffer.toString('utf8');
    assert.ok(archiveIndex.includes('Shops/Camden_2026-10-04.pdf'));
    assert.ok(archiveIndex.includes('Workers/Test_Worker_T-001_2026-10-04.pdf'));
    console.log('PASS weekly rota ZIP contains separate shop and worker PDFs');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
