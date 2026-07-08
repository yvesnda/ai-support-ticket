const express = require('express');
const ticketsModel = require('../models/tickets');
const messagesModel = require('../models/messages');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

router.get('/api/tickets', (req, res) => {
  const status = req.query.status || null;
  res.json(ticketsModel.list({ status }));
});

router.get('/api/tickets/:id/messages', (req, res) => {
  const after = Number(req.query.after) || 0;
  res.json(messagesModel.listSince(req.params.id, after));
});

module.exports = router;
