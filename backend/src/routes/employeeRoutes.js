const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { authenticate, authorize } = require('../middleware/auth');

const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

router.get('/', authenticate, employeeController.getAllEmployees);
router.get('/next-id', authenticate, authorize('ADMIN'), employeeController.getNextEmployeeId);
router.get('/compliance/expiring-documents', authenticate, authorize('ADMIN'), employeeController.getExpiringDocuments);
router.post('/upload-document', authenticate, authorize('ADMIN'), upload.single('file'), employeeController.uploadDocument);
router.get('/:id/joining-form/pdf', authenticate, authorize('ADMIN'), employeeController.downloadJoiningFormPDF);
router.post('/:id/documents', authenticate, authorize('ADMIN'), employeeController.addEmployeeDocument);
router.delete('/:id/documents/:docId', authenticate, authorize('ADMIN'), employeeController.deleteEmployeeDocument);
router.get('/:id/profile', authenticate, employeeController.getEmployeeProfile);
router.get('/:id', authenticate, employeeController.getEmployeeById);
router.post('/', authenticate, authorize('ADMIN'), employeeController.createEmployee);
router.put('/:id', authenticate, authorize('ADMIN'), employeeController.updateEmployee);
router.patch('/:id/toggle-status', authenticate, authorize('ADMIN'), employeeController.toggleEmployeeStatus);
router.delete('/:id', authenticate, authorize('ADMIN'), employeeController.deleteEmployee);

module.exports = router;
