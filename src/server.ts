import { buildApp } from './app.js';
import { env } from './config/env.js';
import {
  checkDatabaseConnection,
  pool
} from './database/pool.js';
import { runMigrations } from './database/migrate.js';

async function startServer(): Promise<void> {
  const app = buildApp();

  try {
    await checkDatabaseConnection();

    await runMigrations();

    await app.listen({
      port: env.port,
      host: env.host
    });
  } catch (error) {
    app.log.error(error);
    await pool.end();
    process.exit(1);
  }
}

void startServer();
