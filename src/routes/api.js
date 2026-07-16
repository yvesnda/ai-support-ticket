const express = require('express');
const ticketsModel = require('../models/tickets');
const messagesModel = require('../models/messages');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

router.get('/api/tickets', async (req, res) => {
  const status = req.query.status || null;
  res.json(await ticketsModel.list({ status }));
});

router.get('/api/tickets/:id/messages', async (req, res) => {
  const after = Number(req.query.after) || 0;
  res.json(await messagesModel.listSince(req.params.id, after));
});

module.exports = router;
