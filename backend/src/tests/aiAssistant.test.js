const assert = require('assert');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { askRotaAssistant } = require('../services/ai/aiProvider');
const { getStoredPdf } = require('../services/ai/aiPdfReportService');

async function runAiTests() {
  console.log('--- RUNNING AI ROTA ASSISTANT TESTS ---');
  await mongoose.connect(process.env.MONGO_URI);

  try {
    // 1. Test Greeting
    const greetRes = await askRotaAssistant('hello');
    assert.strictEqual(greetRes.success, true, 'Greeting must succeed');
    assert.ok(greetRes.message.includes('AI Workforce & Finance Assistant'), 'Greeting message should introduce assistant');
    console.log('✓ 1. Greeting query test passed');

    // 2. Test Worker query
    const workerRes = await askRotaAssistant('Show me Shiva details');
    assert.strictEqual(workerRes.success, true, 'Worker query must succeed');
    assert.ok(workerRes.message.includes('Shiva'), 'Result must include worker name');
    console.log('✓ 2. Worker details query test passed');

    // 3. Test Shop query
    const shopRes = await askRotaAssistant('Camden shop details');
    assert.strictEqual(shopRes.success, true, 'Shop query must succeed');
    assert.ok(shopRes.message.includes('Camden'), 'Result must mention Camden shop');
    console.log('✓ 3. Shop details query test passed');

    // 4. Test Daily Attendance overview
    const dayRes = await askRotaAssistant('2026-11-05 attendance overview');
    assert.strictEqual(dayRes.success, true, 'Day overview query must succeed');
    assert.ok(dayRes.message.includes('Attendance Overview'), 'Result must contain attendance overview table');
    console.log('✓ 4. Day attendance overview query test passed');

    // 5. Test PDF report generation
    const pdfRes = await askRotaAssistant('Give me Shiva attendance in PDF');
    assert.strictEqual(pdfRes.success, true, 'PDF generation must succeed');
    assert.ok(pdfRes.pdfReport, 'Must return a pdfReport object');
    assert.ok(pdfRes.pdfReport.token, 'Must return a valid PDF token');

    const storedPdf = getStoredPdf(pdfRes.pdfReport.token);
    assert.ok(storedPdf, 'PDF buffer must be retrievable via token');
    assert.ok(storedPdf.buffer.length > 500, 'PDF buffer should be non-empty valid binary');
    console.log('✓ 5. PDF generation & download token test passed (Buffer size:', storedPdf.buffer.length, 'bytes)');

    console.log('\nALL 5 AI ASSISTANT BACKEND TESTS PASSED SUCCESSFULLY!');
  } finally {
    await mongoose.disconnect();
  }
}

runAiTests().catch(err => {
  console.error('AI Test Failure:', err);
  process.exit(1);
});
