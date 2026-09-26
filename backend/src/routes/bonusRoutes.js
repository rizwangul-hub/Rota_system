const express = require('express');
const router = express.Router();
const bonusController = require('../controllers/bonusController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, bonusController.getAllBonuses);
router.post('/', authenticate, authorize('ADMIN'), bonusController.createBonus);
router.put('/:id', authenticate, authorize('ADMIN'), bonusController.updateBonus);
router.delete('/:id', authenticate, authorize('ADMIN'), bonusController.deleteBonus);

module.exports = router;
