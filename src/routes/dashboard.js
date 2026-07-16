const express = require('express');
const ticketsModel = require('../models/tickets');
const messagesModel = require('../models/messages');
const usersModel = require('../models/users');
const ticketService = require('../services/ticketService');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

router.get('/dashboard', async (req, res) => {
  const status = req.query.status || null;
  const tickets = await ticketsModel.list({ status });
  res.render('dashboard/list', { tickets, status });
});

router.get('/dashboard/tickets/:id', async (req, res) => {
  const ticket = await ticketsModel.findById(req.params.id);
  if (!ticket) return res.status(404).render('error', { message: 'Ticket not found.' });
  const messages = await messagesModel.listForTicket(ticket.id);
  const supporters = await usersModel.listSupporters();
  res.render('dashboard/detail', { ticket, messages, supporters });
});

router.post('/dashboard/tickets/:id/reply', async (req, res) => {
  const ticket = await ticketsModel.findById(req.params.id);
  if (!ticket) return res.status(404).render('error', { message: 'Ticket not found.' });
  const body = (req.body.body || '').trim();
  if (body) {
    await ticketService.sendSupporterReply(ticket, req.session.user, body);
  }
  res.redirect(`/dashboard/tickets/${ticket.id}`);
});

router.post('/dashboard/tickets/:id/drafts/:messageId/approve', async (req, res) => {
  const ticket = await ticketsModel.findById(req.params.id);
  const message = await messagesModel.findById(req.params.messageId);
  if (!ticket || !message) return res.status(404).render('error', { message: 'Not found.' });
  await ticketService.approveAiDraft(ticket, message, req.body.body);
  res.redirect(`/dashboard/tickets/${ticket.id}`);
});

router.post('/dashboard/tickets/:id/drafts/:messageId/discard', async (req, res) => {
  const message = await messagesModel.findById(req.params.messageId);
  if (message) await ticketService.discardAiDraft(message);
  res.redirect(`/dashboard/tickets/${req.params.id}`);
});

router.post('/dashboard/tickets/:id/status', async (req, res) => {
  await ticketsModel.setStatus(req.params.id, req.body.status);
  res.redirect(`/dashboard/tickets/${req.params.id}`);
});

router.post('/dashboard/tickets/:id/assign', async (req, res) => {
  const userId = req.body.assigned_to ? Number(req.body.assigned_to) : null;
  await ticketsModel.setAssignee(req.params.id, userId);
  res.redirect(`/dashboard/tickets/${req.params.id}`);
});

module.exports = router;
