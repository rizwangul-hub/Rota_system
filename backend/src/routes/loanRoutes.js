const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');
const { authenticate, authorize } = require('../middleware/auth');

// All authenticated roles can view employee loans, Admin can create/modify
router.get('/', authenticate, loanController.getAllLoans);
router.get('/employee/:employeeId', authenticate, loanController.getEmployeeLoans);

router.post('/', authenticate, authorize('ADMIN'), loanController.createLoan);
router.post('/:loanId/repayments', authenticate, authorize('ADMIN'), loanController.recordRepayment);
router.delete('/:loanId', authenticate, authorize('ADMIN'), loanController.deleteLoan);

module.exports = router;
