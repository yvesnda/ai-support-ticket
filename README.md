# Supporter

A small, self-contained support ticketing system: customers submit tickets through a plain form (no account needed), supporters/admins log in to answer them, and an AI drafts a first-pass reply on every ticket using tools you can configure without touching code. New ticket sources (email today, SMS/Instagram later) plug in through a small interface.

Everything runs as a single Node.js process with server-rendered (EJS) views — no separate frontend, no build step.

## Features

- **No-signup ticket submission** — a plain public form (name, email, subject, message).
- **Supporter/admin login** — session-based auth, two roles (`admin`, `supporter`).
- **AI-drafted replies** — every new ticket message goes through OpenAI (function calling) to draft a reply. By default a supporter must approve/edit/discard the draft before it's sent; an "auto-send" setting can let the AI reply unattended.
- **AI honesty** — the AI is instructed not to guess or hallucinate: if it can't understand the request or doesn't have the tools/info to help, it says so honestly instead of making something up.
- **AI can close tickets** — a built-in `close_ticket` tool lets the model mark a ticket closed when it decides the issue is fully resolved (e.g. the customer confirms it's fixed).
- **Dynamic AI tools** — admins can add tools (OpenAI function calling) at runtime from the UI:
  - **http** tools: config-driven — name, JSON parameter schema, and a request template (method/url/headers/body with `{{param}}` substitution). No code execution.
  - **js** tools: a JS snippet run server-side in a `vm` sandbox. Admin-trusted only — see the security note below.
- **Plugins for ticket sources** — a small, documented plugin contract (`{ name, start(ctx), stop(), sendReply(ticket, message) }`). Ships with an **email** plugin (IMAP polling + SMTP sending, with reply threading). Add SMS/Instagram/etc. by dropping a new folder under `src/plugins/`.
- **Status tags**, driven automatically by who acted last:
  - `open` — a customer message is waiting on a reply (also applies when a customer replies to a closed ticket — it reopens automatically)
  - `ai_replied` — the AI auto-sent a reply (only relevant if auto-send is on)
  - `replied` — a supporter sent or approved a reply
  - `closed` — manually closed, or closed by the AI via `close_ticket`
- **Live-ish dashboard** — the ticket list and ticket detail pages poll the server every few seconds and refresh when something changes (no WebSockets, kept dependency-light).

## Tech stack

- Express + EJS (via `express-ejs-layouts`) for embedded, server-rendered views
- SQLite (`better-sqlite3`) — single file, zero setup, hand-rolled migrations
- `express-session` + `bcryptjs` for auth
- `openai` SDK for AI drafting/tool calling
- `imapflow` + `mailparser` (inbound email) and `nodemailer` (outbound email) for the email plugin
- `dotenv` for configuration

## Getting started

```bash
npm install
cp .env.example .env   # then edit .env — see below
npm start               # or: node index.js
```

On first run:
- SQLite migrations apply automatically (`data/supporter.sqlite` is created).
- If no users exist yet, a bootstrap admin is created from `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` in `.env`.
- The server listens on `http://localhost:3000` (or `PORT`).

Then:
- Visit `/` to submit a test ticket as a customer.
- Log in at `/login` with the bootstrap admin credentials.
- **Change the bootstrap admin password** (via `/admin/supporters`, or just edit `.env` before first run) — `ADMIN_PASSWORD` in the example file is a placeholder.

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default `3000`) |
| `SESSION_SECRET` | Session cookie signing secret — set a real random value |
| `DB_PATH` | Path to the SQLite file (default `./data/supporter.sqlite`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Bootstrap admin, created only if no users exist yet |
| `OPENAI_API_KEY` | Enables AI drafting. Leave blank to disable it — the app degrades gracefully (no drafts, no crash) |
| `OPENAI_MODEL` | Default model for AI drafting (can be overridden per-install in the admin UI) |

## How it fits together

```
index.js                     # entrypoint: run migrations, bootstrap admin, start plugins, start server
src/
  db/                         # SQLite connection + migrations (plain .sql files, run once each)
  models/                     # thin query wrappers: users, tickets, messages, aiTools, settings, pluginSettings
  middleware/auth.js          # requireLogin, requireRole('admin')
  routes/
    public.js                 # GET / (ticket form), POST /tickets — no auth
    auth.js                   # /login, /logout
    dashboard.js               # ticket list/detail/reply/status/assign — supporter+admin
    admin.js                   # supporters CRUD, AI settings/tools, plugin config — admin only
    api.js                     # small JSON endpoints the dashboard polls
  services/
    ticketService.js           # single entrypoint for creating tickets / adding messages; drives status
                                # transitions and triggers the AI draft — both routes and plugins call this
    pluginManager.js            # discovers/starts/stops plugins, routes outbound replies to the right one
    ai/
      client.js                 # OpenAI client wrapper
      orchestrator.js            # builds the prompt + tool list, runs the tool-call loop, returns {reply, closed}
      tools/httpTool.js          # executes config-driven HTTP tool calls
      tools/jsTool.js            # executes vm-sandboxed JS tool calls
  plugins/
    email/index.js               # IMAP poll → ticketService; sendReply() → nodemailer SMTP, thread-aware
  views/                        # EJS templates (layout.ejs wraps everything via express-ejs-layouts)
  public/                       # static CSS + the small polling script
```

### Request flow

1. **Customer submits a ticket** (`POST /tickets`, no auth) → `ticketService.createTicket()` stores the ticket + first message, then asynchronously asks the AI orchestrator for a draft reply.
2. **AI drafts a reply** — the orchestrator sends the *entire* ticket conversation (not just the latest message) plus the enabled tools to OpenAI. If the model calls a tool, it's dispatched (`http`/`js`) and the result is fed back until the model returns a final answer, or decides to call the built-in `close_ticket` tool.
3. Depending on the **auto-send** setting: the draft either goes out immediately (status → `ai_replied`, or `closed` if the model closed it) or sits on the ticket for a supporter to approve, edit, or discard.
4. **Supporters/admins** work tickets from `/dashboard`; every reply they send or approve sets status → `replied`.
5. Any new customer message — including a reply to a `closed` ticket via email — reopens the ticket to `open`.

### Adding a new ticket-source plugin

Drop a folder under `src/plugins/<name>/index.js` exporting:

```js
module.exports = {
  name: 'sms',
  async start(ctx) { /* ctx = { config, ticketService, logger } */ },
  async stop() {},
  async sendReply(ticket, message) {
    // send it out over your channel; optionally return { messageId }
    // so a customer's reply-to-this-message still threads back correctly
  },
};
```

It'll show up automatically in `/admin/plugins` with an enable toggle and a JSON config box (whatever shape your plugin needs — see the email plugin's expected keys as an example).

## Security notes

- **JS-type AI tools are not a real sandbox.** Node's `vm` module does not protect against sandbox-escape techniques. Only let people you'd trust with server-side code execution add `js` tools — treat it the same as giving them a shell. Prefer `http` tools wherever possible.
- **Session store is in-memory** (Express default `MemoryStore`) — fine for a single-process MVP, but sessions won't survive a restart and it isn't meant for multi-process deployment. Swap in a persistent store (e.g. a SQLite- or Redis-backed one) if you outgrow that.
- **Change the default admin password and `SESSION_SECRET`** before exposing this beyond localhost.

## Known limitations / not-yet-built

- SMS and Instagram plugins are not implemented yet — only the interface and the email reference implementation exist.
- No rate-limiting on the public ticket form.
- Email plugin polls IMAP on an interval (default 60s, configurable) rather than IDLE/push.
