const ticketsModel = require('../models/tickets');
const messagesModel = require('../models/messages');
const settingsModel = require('../models/settings');
const orchestrator = require('./ai/orchestrator');
const pluginManager = require('./pluginManager');

// Sends a message out through its ticket's channel plugin and remembers the
// resulting Message-ID (if any) so a customer's *next* reply — which threads
// off of this outbound message, not their original one — still matches back
// to this ticket. See src/plugins/email/index.js for why this matters.
async function sendAndRecord(ticket, msg) {
  const result = await pluginManager.sendReply(ticket, msg);
  if (result?.messageId) await messagesModel.setMessageId(msg.id, result.messageId);
}

// Single entrypoint used by both the public web form and channel plugins
// (email, and later SMS/Instagram) to create a new ticket from an inbound message.
async function createTicket({ subject, customer_name, customer_email, body, channel = 'web', source_plugin = null, external_ref = null }) {
  const ticket = await ticketsModel.create({ subject, customer_name, customer_email, channel, source_plugin, external_ref });
  await messagesModel.create({ ticket_id: ticket.id, sender_type: 'customer', body });
  triggerAiDraft(ticket.id).catch((err) => console.error('[ai] draft error:', err.message));
  return ticket;
}

// Appends a follow-up message from the customer on an existing ticket (e.g. a
// reply email that threaded back to an open ticket). A customer message
// always puts the ticket back in the "open" tag — including reopening one
// that was previously closed — since it's now waiting on us again.
async function addCustomerMessage(ticket, body) {
  await messagesModel.create({ ticket_id: ticket.id, sender_type: 'customer', body });
  await ticketsModel.setStatus(ticket.id, 'open');
  triggerAiDraft(ticket.id).catch((err) => console.error('[ai] draft error:', err.message));
}

async function triggerAiDraft(ticketId) {
  const ticket = await ticketsModel.findById(ticketId);
  const messages = await messagesModel.listForTicket(ticketId);
  const { reply, closed } = await orchestrator.draftReply(ticket, messages);

  if (!reply) {
    // Nothing to say, but the model may still have decided the ticket needs
    // no further reply (e.g. a closing tool call with no new text).
    if (closed) await ticketsModel.setStatus(ticketId, 'closed');
    return;
  }

  const autoSend = (await settingsModel.get('ai_auto_send')) === 'true';
  const msg = await messagesModel.create({
    ticket_id: ticketId,
    sender_type: 'ai',
    body: reply,
    is_ai_draft: !autoSend,
  });

  if (autoSend) {
    await sendAndRecord(ticket, msg);
    await ticketsModel.setStatus(ticketId, closed ? 'closed' : 'ai_replied');
  } else if (closed) {
    await ticketsModel.setStatus(ticketId, 'closed');
  } else {
    await ticketsModel.touch(ticketId);
  }
}

// A supporter/admin sends a brand-new reply (not editing an AI draft).
async function sendSupporterReply(ticket, user, body) {
  const msg = await messagesModel.create({ ticket_id: ticket.id, sender_type: 'supporter', sender_id: user.id, body });
  await ticketsModel.setStatus(ticket.id, 'replied');
  await sendAndRecord(ticket, msg);
  return msg;
}

// A supporter approves (optionally after editing) an AI draft, sending it as-is.
async function approveAiDraft(ticket, message, editedBody) {
  if (editedBody !== undefined && editedBody !== message.body) {
    await messagesModel.updateBody(message.id, editedBody);
    message = { ...message, body: editedBody };
  }
  await messagesModel.markSent(message.id);
  await ticketsModel.setStatus(ticket.id, 'replied');
  await sendAndRecord(ticket, message);
  return message;
}

async function discardAiDraft(message) {
  await messagesModel.remove(message.id);
}

module.exports = {
  createTicket,
  addCustomerMessage,
  triggerAiDraft,
  sendSupporterReply,
  approveAiDraft,
  discardAiDraft,
};
