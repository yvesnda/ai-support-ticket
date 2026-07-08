(function () {
  const POLL_MS = 5000;

  // --- Ticket list page: reload only when something actually changed ---
  const listRoot = document.querySelector('[data-poll="list"]');
  if (listRoot) {
    let lastSignature = listRoot.dataset.signature || '';
    const status = listRoot.dataset.status || '';

    setInterval(async () => {
      try {
        const res = await fetch(`/api/tickets${status ? '?status=' + encodeURIComponent(status) : ''}`);
        const tickets = await res.json();
        const signature = tickets.map((t) => `${t.id}:${t.status}:${t.updated_at}`).join('|');
        if (signature !== lastSignature) {
          lastSignature = signature;
          window.location.reload();
        }
      } catch (err) {
        // ignore transient network errors
      }
    }, POLL_MS);
  }

  // --- Ticket detail page: append new messages without a full reload ---
  const threadRoot = document.querySelector('[data-poll="thread"]');
  if (threadRoot) {
    const ticketId = threadRoot.dataset.ticketId;
    const lastId = Number(threadRoot.dataset.lastId || 0);

    setInterval(async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/messages?after=${lastId}`);
        const messages = await res.json();
        if (messages.length) {
          // A new AI draft or reply arrived; reload so approve/discard forms are wired up correctly.
          window.location.reload();
        }
      } catch (err) {
        // ignore transient network errors
      }
    }, POLL_MS);
  }
})();
