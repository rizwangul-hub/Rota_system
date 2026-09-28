const express = require('express');
const router = express.Router();
const rotaController = require('../controllers/rotaController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('ADMIN'));

router.get('/dashboard', rotaController.dashboard);
router.get('/availability', rotaController.getAvailability);
router.put('/availability', rotaController.saveAvailability);
router.put('/availability/bulk', rotaController.saveAvailabilityBulk);
router.get('/history', rotaController.history);

router.get('/employee/:employeeId/:weekStart/export.xlsx', rotaController.exportExcel);
router.get('/employee/:employeeId/:weekStart/export.pdf', rotaController.exportPdf);
router.get('/employee/:employeeId/:weekStart', rotaController.employeeWeek);
router.get('/week/:weekStart/export.xlsx', rotaController.exportExcel);
router.get('/week/:weekStart/export.pdf', rotaController.exportPdf);
router.put('/week/:weekStart/draft', rotaController.saveDraft);
router.patch('/week/:weekStart/assignment/:assignmentId/lock', rotaController.setAssignmentLock);
router.post('/week/:weekStart/validate', rotaController.validateWeek);
router.post('/week/:weekStart/publish', rotaController.publish);
router.post('/week/:weekStart/ai', rotaController.generateWithAI);
router.get('/week/:weekStart', rotaController.getWeek);

module.exports = router;
