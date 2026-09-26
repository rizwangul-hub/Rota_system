const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, employeeController.getAllEmployees);
router.get('/next-id', authenticate, authorize('ADMIN'), employeeController.getNextEmployeeId);
router.get('/:id/profile', authenticate, employeeController.getEmployeeProfile);
router.get('/:id', authenticate, employeeController.getEmployeeById);
router.post('/', authenticate, authorize('ADMIN'), employeeController.createEmployee);
router.put('/:id', authenticate, authorize('ADMIN'), employeeController.updateEmployee);
router.patch('/:id/toggle-status', authenticate, authorize('ADMIN'), employeeController.toggleEmployeeStatus);

module.exports = router;
