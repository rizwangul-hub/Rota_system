const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, shopController.getAllShops);
router.get('/schedules', authenticate, shopController.getSchedules);
router.put('/schedules/:id', authenticate, authorize('ADMIN'), shopController.updateSchedule);
router.get('/default-shift', authenticate, shopController.getDefaultShiftForDate);
router.get('/:id', authenticate, shopController.getShopById);
router.post('/', authenticate, authorize('ADMIN'), shopController.createShop);
router.put('/:id', authenticate, authorize('ADMIN'), shopController.updateShop);
router.patch('/:id/toggle-status', authenticate, authorize('ADMIN'), shopController.toggleShopStatus);

module.exports = router;

