const express = require('express');
const router = express.Router();
const rotaController = require('../controllers/rotaController');
const { authenticate, authorize } = require('../middleware/auth');

const ROTA_VIEW_ROLES = ['ADMIN', 'ATTENDANCE_CHECKER', 'ATTENDANCE_OPERATOR'];

router.use(authenticate);

// Read-only / Export endpoints accessible to Admin, Attendance Checkers, and Operators
router.get('/dashboard', authorize(...ROTA_VIEW_ROLES), rotaController.dashboard);
router.get('/availability', authorize(...ROTA_VIEW_ROLES), rotaController.getAvailability);
router.get('/history', authorize(...ROTA_VIEW_ROLES), rotaController.history);

router.get('/employee/:employeeId/:weekStart/export.xlsx', authorize(...ROTA_VIEW_ROLES), rotaController.exportExcel);
router.get('/employee/:employeeId/:weekStart/export.pdf', authorize(...ROTA_VIEW_ROLES), rotaController.exportPdf);
router.get('/employee/:employeeId/:weekStart', authorize(...ROTA_VIEW_ROLES), rotaController.employeeWeek);
router.get('/week/:weekStart/export-pdfs.zip', authorize(...ROTA_VIEW_ROLES), rotaController.exportIndividualPdfs);
router.get('/week/:weekStart/export.xlsx', authorize(...ROTA_VIEW_ROLES), rotaController.exportExcel);
router.get('/week/:weekStart/export.pdf', authorize(...ROTA_VIEW_ROLES), rotaController.exportPdf);
router.post('/week/:weekStart/export.pdf', authorize(...ROTA_VIEW_ROLES), rotaController.exportPdf);
router.get('/week/:weekStart', authorize(...ROTA_VIEW_ROLES), rotaController.getWeek);

// Admin-only mutating endpoints
router.put('/availability', authorize('ADMIN'), rotaController.saveAvailability);
router.put('/availability/bulk', authorize('ADMIN'), rotaController.saveAvailabilityBulk);
router.put('/week/:weekStart/draft', authorize('ADMIN'), rotaController.saveDraft);
router.delete('/week/:weekStart/draft', authorize('ADMIN'), rotaController.discardDraft);
router.patch('/week/:weekStart/assignment/:assignmentId/lock', authorize('ADMIN'), rotaController.setAssignmentLock);
router.post('/week/:weekStart/validate', authorize('ADMIN'), rotaController.validateWeek);
router.post('/week/:weekStart/publish', authorize('ADMIN'), rotaController.publish);
router.post('/week/:weekStart/archive', authorize('ADMIN'), rotaController.archive);
router.post('/week/:weekStart/ai', authorize('ADMIN'), rotaController.generateWithAI);

module.exports = router;
