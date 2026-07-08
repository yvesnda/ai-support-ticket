const express = require('express');
const bcrypt = require('bcryptjs');
const usersModel = require('../models/users');
const aiToolsModel = require('../models/aiTools');
const settingsModel = require('../models/settings');
const pluginSettingsModel = require('../models/pluginSettings');
const pluginManager = require('../services/pluginManager');
const { CLOSE_TICKET_TOOL } = require('../services/ai/orchestrator');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

// --- Supporters ---

router.get('/admin/supporters', (req, res) => {
  res.render('admin/supporters', { users: usersModel.listAll(), error: null });
});

router.post('/admin/supporters', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).render('admin/supporters', { users: usersModel.listAll(), error: 'All fields are required.' });
  }
  if (usersModel.findByEmail(email.trim())) {
    return res.status(400).render('admin/supporters', { users: usersModel.listAll(), error: 'A user with that email already exists.' });
  }
  const password_hash = bcrypt.hashSync(password, 10);
  usersModel.create({ name: name.trim(), email: email.trim(), password_hash, role: role === 'admin' ? 'admin' : 'supporter' });
  res.redirect('/admin/supporters');
});

router.post('/admin/supporters/:id/toggle-active', (req, res) => {
  const user = usersModel.findById(req.params.id);
  if (user) usersModel.setActive(user.id, !user.active);
  res.redirect('/admin/supporters');
});

router.post('/admin/supporters/:id/role', (req, res) => {
  usersModel.updateRole(req.params.id, req.body.role === 'admin' ? 'admin' : 'supporter');
  res.redirect('/admin/supporters');
});

// --- AI settings + tools ---

router.get('/admin/ai', (req, res) => {
  res.render('admin/ai', { settings: settingsModel.getAll(), tools: aiToolsModel.list(), error: null });
});

router.post('/admin/ai/settings', (req, res) => {
  const { ai_system_prompt, ai_model, ai_enabled, ai_auto_send } = req.body;
  settingsModel.setMany({
    ai_system_prompt: ai_system_prompt || '',
    ai_model: ai_model || 'gpt-4o-mini',
    ai_enabled: ai_enabled === 'on' ? 'true' : 'false',
    ai_auto_send: ai_auto_send === 'on' ? 'true' : 'false',
  });
  res.redirect('/admin/ai');
});

router.post('/admin/ai/tools', (req, res) => {
  const { name, description, type, schema_json, config_json } = req.body;
  if (name && name.trim() === CLOSE_TICKET_TOOL) {
    return res.status(400).render('admin/ai', {
      settings: settingsModel.getAll(),
      tools: aiToolsModel.list(),
      error: `"${CLOSE_TICKET_TOOL}" is a reserved built-in tool name.`,
    });
  }
  try {
    JSON.parse(schema_json || '{}');
    JSON.parse(config_json || '{}');
  } catch (err) {
    return res.status(400).render('admin/ai', {
      settings: settingsModel.getAll(),
      tools: aiToolsModel.list(),
      error: `Invalid JSON: ${err.message}`,
    });
  }
  aiToolsModel.create({
    name: name.trim(),
    description: description || '',
    type: type === 'js' ? 'js' : 'http',
    schema_json,
    config_json,
  });
  res.redirect('/admin/ai');
});

router.post('/admin/ai/tools/:id', (req, res) => {
  const { name, description, type, schema_json, config_json } = req.body;
  if (name && name.trim() === CLOSE_TICKET_TOOL) {
    return res.status(400).render('admin/ai', {
      settings: settingsModel.getAll(),
      tools: aiToolsModel.list(),
      error: `"${CLOSE_TICKET_TOOL}" is a reserved built-in tool name.`,
    });
  }
  try {
    JSON.parse(schema_json || '{}');
    JSON.parse(config_json || '{}');
  } catch (err) {
    return res.status(400).render('admin/ai', {
      settings: settingsModel.getAll(),
      tools: aiToolsModel.list(),
      error: `Invalid JSON: ${err.message}`,
    });
  }
  aiToolsModel.update(req.params.id, {
    name: name.trim(),
    description: description || '',
    type: type === 'js' ? 'js' : 'http',
    schema_json,
    config_json,
  });
  res.redirect('/admin/ai');
});

router.post('/admin/ai/tools/:id/toggle', (req, res) => {
  const tool = aiToolsModel.findById(req.params.id);
  if (tool) aiToolsModel.setEnabled(tool.id, !tool.enabled);
  res.redirect('/admin/ai');
});

router.post('/admin/ai/tools/:id/delete', (req, res) => {
  aiToolsModel.remove(req.params.id);
  res.redirect('/admin/ai');
});

// --- Plugins ---

router.get('/admin/plugins', (req, res) => {
  res.render('admin/plugins', { plugins: pluginManager.list(), error: null });
});

router.post('/admin/plugins/:name', async (req, res) => {
  const { config_json, enabled } = req.body;
  const name = req.params.name;
  try {
    JSON.parse(config_json || '{}');
  } catch (err) {
    return res.status(400).render('admin/plugins', { plugins: pluginManager.list(), error: `Invalid JSON: ${err.message}` });
  }

  const isEnabled = enabled === 'on';
  pluginSettingsModel.upsert(name, { config_json, enabled: isEnabled });

  // Always stop first so a config change while running is picked up cleanly.
  await pluginManager.stopPlugin(name);
  if (isEnabled) {
    const ticketService = require('../services/ticketService');
    await pluginManager.startPlugin(name, ticketService);
  }

  res.redirect('/admin/plugins');
});

module.exports = router;
