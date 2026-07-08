const express = require('express');
const ticketService = require('../services/ticketService');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('public/new-ticket', { error: null, values: {} });
});

router.post('/tickets', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).render('public/new-ticket', {
      error: 'Please fill in all fields.',
      values: { name, email, subject, message },
    });
  }

  const ticket = await ticketService.createTicket({
    subject: subject.trim(),
    customer_name: name.trim(),
    customer_email: email.trim(),
    body: message.trim(),
    channel: 'web',
  });

  res.render('public/submitted', { ticket });
});

module.exports = router;
