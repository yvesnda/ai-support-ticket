const fs = require('fs');
const path = require('path');
const pluginSettingsModel = require('../models/pluginSettings');

// Plugin contract (see src/plugins/email/index.js for a reference implementation):
//   module.exports = {
//     name: 'email',
//     async start(ctx) { ... },   // ctx = { config, ticketService, logger }
//     async stop() { ... },
//     async sendReply(ticket, message) { ... }, // optional, called for outbound replies
//   }

const pluginsDir = path.join(__dirname, '..', 'plugins');
const loaded = new Map(); // name -> { module, running }

function discover() {
  return fs
    .readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function logger(name) {
  return {
    info: (...args) => console.log(`[plugin:${name}]`, ...args),
    error: (...args) => console.error(`[plugin:${name}]`, ...args),
  };
}

async function startAll(ticketService) {
  for (const name of discover()) {
    const mod = require(path.join(pluginsDir, name));
    loaded.set(name, { module: mod, running: false });

    const settings = pluginSettingsModel.get(name);
    if (settings && settings.enabled) {
      await startPlugin(name, ticketService);
    }
  }
}

async function startPlugin(name, ticketService) {
  const entry = loaded.get(name);
  if (!entry || entry.running) return;
  const settings = pluginSettingsModel.get(name);
  const config = settings ? JSON.parse(settings.config_json || '{}') : {};
  try {
    await entry.module.start({ config, ticketService, logger: logger(name) });
    entry.running = true;
  } catch (err) {
    console.error(`[plugin:${name}] failed to start:`, err.message);
  }
}

async function stopPlugin(name) {
  const entry = loaded.get(name);
  if (!entry || !entry.running) return;
  try {
    if (entry.module.stop) await entry.module.stop();
  } finally {
    entry.running = false;
  }
}

async function sendReply(ticket, message) {
  if (!ticket.source_plugin) return null;
  const entry = loaded.get(ticket.source_plugin);
  if (!entry || !entry.running || !entry.module.sendReply) return null;
  try {
    return (await entry.module.sendReply(ticket, message)) || null;
  } catch (err) {
    console.error(`[plugin:${ticket.source_plugin}] sendReply failed:`, err.message);
    return null;
  }
}

function list() {
  return discover().map((name) => ({
    name,
    running: loaded.get(name)?.running || false,
    settings: pluginSettingsModel.get(name),
  }));
}

module.exports = { startAll, startPlugin, stopPlugin, sendReply, list };
