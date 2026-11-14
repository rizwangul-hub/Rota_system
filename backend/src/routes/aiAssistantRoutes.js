const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const aiAssistantController = require('../controllers/aiAssistantController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

// All authenticated roles (ADMIN, ATTENDANCE_CHECKER, ATTENDANCE_OPERATOR, SALARY_DISTRIBUTOR) can query the AI assistant
router.post('/chat', authenticate, aiAssistantController.handleRotaChat);

// Voice STT & TTS endpoints
router.post('/transcribe', authenticate, upload.single('audio'), aiAssistantController.handleTranscribeAudio);
router.post('/speak', authenticate, aiAssistantController.handleSynthesizeSpeech);

// PDF Download token endpoint (token is in URL path or query)
router.get('/download-report/:token', aiAssistantController.handleDownloadPdfReport);
router.get('/download-report', aiAssistantController.handleDownloadPdfReport);

// AI Status endpoint
router.get('/status', authenticate, aiAssistantController.handleAiStatus);

module.exports = router;
