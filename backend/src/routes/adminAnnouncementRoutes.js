const express = require('express');
const router = express.Router();
const adminAnnouncementController = require('../controllers/adminAnnouncementController');
const { authenticate, authorize } = require('../middleware/auth');

// All admin announcement routes require ADMIN role
router.use(authenticate, authorize('ADMIN'));

router.get('/', adminAnnouncementController.getAnnouncements);
router.post('/', adminAnnouncementController.createAnnouncement);
router.put('/:id', adminAnnouncementController.updateAnnouncement);
router.post('/:id/archive', adminAnnouncementController.archiveAnnouncement);
router.delete('/:id', adminAnnouncementController.deleteAnnouncement);
router.get('/:id/readership', adminAnnouncementController.getReadership);

module.exports = router;
