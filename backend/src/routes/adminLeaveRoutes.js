const express = require('express');
const router = express.Router();
const adminLeaveController = require('../controllers/adminLeaveController');
const { authenticate, authorize } = require('../middleware/auth');

// All admin leave routes require ADMIN role
router.use(authenticate, authorize('ADMIN'));

router.get('/', adminLeaveController.getLeaves);
router.get('/:id', adminLeaveController.getLeaveDetails);
router.post('/:id/review', adminLeaveController.reviewLeave);

module.exports = router;
