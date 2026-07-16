const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const ticketsModel = require('../../models/tickets');
const messagesModel = require('../../models/messages');

let pollTimer = null;
let currentCtx = null;

// A reply can carry its parent's id in In-Reply-To, and/or the whole thread's
// ids in References (oldest first). Different mail clients populate these
// differently (some only ever set In-Reply-To to the immediate parent), so we
// collect every candidate id and try each one rather than assuming any single
// header is the one that matches.
function extractCandidateRefs(parsed) {
  const refs = new Set();
  if (parsed.inReplyTo) refs.add(parsed.inReplyTo);
  if (parsed.references) {
    const arr = Array.isArray(parsed.references) ? parsed.references : [parsed.references];
    arr.forEach((r) => refs.add(r));
  }
  return [...refs];
}

// Finds the ticket a reply belongs to by checking each candidate id against
// both the ticket's original external_ref (the customer's first email) and
// the message_id of every reply we've sent out (since a customer often
// replies to *our* last message, not their own original one).
async function findTicketForRefs(candidates) {
  for (const ref of candidates) {
    const ticket = await ticketsModel.findByExternalRef(ref);
    if (ticket) return ticket;

    const message = await messagesModel.findByMessageId(ref);
    if (message) return ticketsModel.findById(message.ticket_id);
  }
  return null;
}

async function pollOnce(ctx) {
  const { config, ticketService, logger } = ctx;
  const client = new ImapFlow({
    host: config.imapHost,
    port: Number(config.imapPort) || 993,
    secure: config.imapSecure !== false,
    auth: { user: config.imapUser, pass: config.imapPass },
    logger: false,
  });

  await client.connect();
  try {
    const mailbox = config.mailbox || 'INBOX';
    const lock = await client.getMailboxLock(mailbox);
    try {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const uids = await client.search({ seen: false, since: oneMonthAgo });
      for (const uid of uids || []) {
        const msg = await client.fetchOne(
          uid,
          { source: true },
          { uid: true }
        );
        console.log(msg);

        if (!msg || !msg.source) {
          console.log('No source for UID', uid);
          continue;
        }

        const parsed = await simpleParser(msg.source);

        const fromAddr = parsed.from?.value?.[0]?.address || 'unknown@unknown';
        const fromName = parsed.from?.value?.[0]?.name || fromAddr;
        const body = parsed.text || parsed.html || '(empty message)';
        const subject = parsed.subject || '(no subject)';
        const messageId = parsed.messageId;

        const existing = await findTicketForRefs(extractCandidateRefs(parsed));
        if (existing) {
          await ticketService.addCustomerMessage(existing, body);
          logger.info(`appended message to ticket #${existing.id} from ${fromAddr}`);
        } else {
          const ticket = await ticketService.createTicket({
            subject,
            customer_name: fromName,
            customer_email: fromAddr,
            body,
            channel: 'email',
            source_plugin: 'email',
            external_ref: messageId,
          });
          logger.info(`created ticket #${ticket.id} from ${fromAddr}`);
        }

        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => { });
  }
}

function buildTransport(config) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: Number(config.smtpPort) || 587,
    secure: !!config.smtpSecure,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
  });
}

async function start(ctx) {
  currentCtx = ctx;
  const intervalMs = Number(ctx.config.pollIntervalMs) || 60000;

  const tick = () => pollOnce(ctx).catch((err) => ctx.logger.error('poll failed:', err.message));
  tick();
  pollTimer = setInterval(tick, intervalMs);
}

async function stop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  currentCtx = null;
}

// Returns { messageId } so the caller can remember this reply's Message-ID —
// that's how a customer's *next* reply (which threads off of this message,
// not their original one) still gets matched back to the same ticket.
async function sendReply(ticket, message) {
  if (!currentCtx) return;
  const { config, logger } = currentCtx;
  const transport = buildTransport(config);

  const info = await transport.sendMail({
    from: config.fromAddress || config.smtpUser,
    to: ticket.customer_email,
    subject: ticket.subject.startsWith('Re:') ? ticket.subject : `Re: ${ticket.subject}`,
    text: message.body,
    inReplyTo: ticket.external_ref || undefined,
    references: ticket.external_ref || undefined,
  });

  logger.info(`sent reply for ticket #${ticket.id} to ${ticket.customer_email}`);
  return { messageId: info.messageId };
}

module.exports = { name: 'email', start, stop, sendReply };
