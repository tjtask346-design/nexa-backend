const express = require('express');
const router = express.Router();
const c = require('../controllers/notificationController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', c.getMyNotifications);
router.put('/:id/read', c.markOneRead);
router.put('/read-all', c.markAllRead);
router.delete('/:id', c.deleteOne);
router.delete('/', c.deleteAll);

module.exports = router;
