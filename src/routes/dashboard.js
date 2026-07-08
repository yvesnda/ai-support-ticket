const express = require('express');
const ticketsModel = require('../models/tickets');
const messagesModel = require('../models/messages');
const usersModel = require('../models/users');
const ticketService = require('../services/ticketService');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

router.get('/dashboard', (req, res) => {
  const status = req.query.status || null;
  const tickets = ticketsModel.list({ status });
  res.render('dashboard/list', { tickets, status });
});

router.get('/dashboard/tickets/:id', (req, res) => {
  const ticket = ticketsModel.findById(req.params.id);
  if (!ticket) return res.status(404).render('error', { message: 'Ticket not found.' });
  const messages = messagesModel.listForTicket(ticket.id);
  const supporters = usersModel.listSupporters();
  res.render('dashboard/detail', { ticket, messages, supporters });
});

router.post('/dashboard/tickets/:id/reply', async (req, res) => {
  const ticket = ticketsModel.findById(req.params.id);
  if (!ticket) return res.status(404).render('error', { message: 'Ticket not found.' });
  const body = (req.body.body || '').trim();
  if (body) {
    await ticketService.sendSupporterReply(ticket, req.session.user, body);
  }
  res.redirect(`/dashboard/tickets/${ticket.id}`);
});

router.post('/dashboard/tickets/:id/drafts/:messageId/approve', async (req, res) => {
  const ticket = ticketsModel.findById(req.params.id);
  const message = messagesModel.findById(req.params.messageId);
  if (!ticket || !message) return res.status(404).render('error', { message: 'Not found.' });
  await ticketService.approveAiDraft(ticket, message, req.body.body);
  res.redirect(`/dashboard/tickets/${ticket.id}`);
});

router.post('/dashboard/tickets/:id/drafts/:messageId/discard', (req, res) => {
  const message = messagesModel.findById(req.params.messageId);
  if (message) ticketService.discardAiDraft(message);
  res.redirect(`/dashboard/tickets/${req.params.id}`);
});

router.post('/dashboard/tickets/:id/status', (req, res) => {
  ticketsModel.setStatus(req.params.id, req.body.status);
  res.redirect(`/dashboard/tickets/${req.params.id}`);
});

router.post('/dashboard/tickets/:id/assign', (req, res) => {
  const userId = req.body.assigned_to ? Number(req.body.assigned_to) : null;
  ticketsModel.setAssignee(req.params.id, userId);
  res.redirect(`/dashboard/tickets/${req.params.id}`);
});

module.exports = router;
