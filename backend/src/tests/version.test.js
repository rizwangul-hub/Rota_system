const assert = require('assert');
const versionController = require('../controllers/versionController');

async function runVersionTests() {
  console.log('--- RUNNING VERSION AND SYSTEM UPDATE TESTS ---');

  // 1. Test getVersion fallback
  const mockRes = {
    headers: {},
    setHeader(key, val) { this.headers[key] = val; },
    json(data) { this.data = data; return this; },
    status(code) { this.statusCode = code; return this; }
  };

  await versionController.getVersion({}, mockRes);
  assert.equal(mockRes.data.success, true);
  assert.ok(mockRes.data.version);
  assert.ok(mockRes.data.buildId);
  assert.equal(mockRes.headers['Cache-Control'], 'no-cache, no-store, must-revalidate');
  console.log('✔ GET /api/version returns valid configuration and no-cache headers');

  console.log('ALL VERSION TESTS PASSED!');
}

runVersionTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
