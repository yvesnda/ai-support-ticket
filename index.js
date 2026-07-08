require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { runMigrations } = require('./src/db');
const usersModel = require('./src/models/users');
const pluginManager = require('./src/services/pluginManager');
const ticketService = require('./src/services/ticketService');
const createApp = require('./src/app');

function bootstrapAdmin() {
  if (usersModel.count() > 0) return;

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';

  if (!email || !password) {
    console.warn('[bootstrap] No users exist yet and ADMIN_EMAIL/ADMIN_PASSWORD are not set — set them in .env and restart.');
    return;
  }

  const password_hash = bcrypt.hashSync(password, 10);
  usersModel.create({ name, email, password_hash, role: 'admin' });
  console.log(`[bootstrap] created initial admin user: ${email}`);
}

async function main() {
  runMigrations();
  bootstrapAdmin();
  await pluginManager.startAll(ticketService);

  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Supporter listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
