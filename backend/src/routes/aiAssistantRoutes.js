const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const aiAssistantController = require('../controllers/aiAssistantController');

// All authenticated roles (ADMIN, ATTENDANCE_CHECKER, ATTENDANCE_OPERATOR, SALARY_DISTRIBUTOR) can query the AI assistant
router.post('/chat', authenticate, aiAssistantController.handleRotaChat);

// PDF Download token endpoint (token is in URL path or query)
router.get('/download-report/:token', aiAssistantController.handleDownloadPdfReport);
router.get('/download-report', aiAssistantController.handleDownloadPdfReport);

// AI Status endpoint
router.get('/status', authenticate, aiAssistantController.handleAiStatus);

module.exports = router;
