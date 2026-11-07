const { askRotaAssistant } = require('../services/ai/aiProvider');
const { getStoredPdf } = require('../services/ai/aiPdfReportService');
const { getAiConfig } = require('../services/ai/aiConfig');

/**
 * Handle AI Assistant Chat Query
 * POST /api/ai/chat
 */
exports.handleRotaChat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A text message is required.'
      });
    }

    const user = req.user;
    const result = await askRotaAssistant(message, history, user);

    return res.status(200).json(result);
  } catch (error) {
    console.error('[AI Assistant Controller Error]:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to process AI assistant request. Please try again.'
    });
  }
};

/**
 * Download Generated PDF Report Endpoint
 * GET /api/ai/download-report/:token
 */
exports.handleDownloadPdfReport = async (req, res) => {
  try {
    const token = req.params.token || req.query.token;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Report download token is required.' });
    }

    const report = getStoredPdf(token);
    if (!report || !report.buffer) {
      return res.status(404).json({
        success: false,
        message: 'The requested PDF report has expired or does not exist. Please ask the AI Assistant to generate it again.'
      });
    }

    // Set download headers (dynamic MIME type for PDF and Excel spreadsheet)
    const isExcel = report.format === 'excel' || (report.fileName && report.fileName.endsWith('.xlsx'));
    const contentType = isExcel
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : (report.mimeType || 'application/pdf');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(report.fileName || (isExcel ? 'Pixx_Report.xlsx' : 'Pixx_Report.pdf'))}"`);
    res.setHeader('Content-Length', report.buffer.length);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    return res.end(report.buffer);
  } catch (error) {
    console.error('[AI PDF Download Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to download the generated PDF.'
    });
  }
};

/**
 * AI Service Health / Status Endpoint
 * GET /api/ai/status
 */
exports.handleAiStatus = async (req, res) => {
  const config = getAiConfig();
  res.json({
    success: true,
    enabled: config.enabled,
    provider: config.provider,
    model: config.model,
    configured: config.configured,
    service: 'PixxTechnologies AI Workforce & Finance Assistant'
  });
};
