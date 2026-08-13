import { buildApp } from './app.js';

import { env } from './config/env.js';

import {
  checkDatabaseConnection,
  pool
} from './database/pool.js';

import {
  runMigrations
} from './database/migrate.js';

import {
  runPartitionMaintenance
} from './database/partition-manager.js';

async function startServer(): Promise<void> {
  const app = buildApp();

  try {
    await checkDatabaseConnection();

    await runMigrations();

    await runPartitionMaintenance();

    await app.listen({
      port: env.port,
      host: env.host
    });

    const maintenanceTimer =
      setInterval(
        () => {
          void runPartitionMaintenance()
            .catch((error) => {
              app.log.error(
                error,
                'partition maintenance failed'
              );
            });
        },
        6 * 60 * 60 * 1000
      );

    maintenanceTimer.unref();
  } catch (error) {
    app.log.error(error);

    await pool.end();

    process.exit(1);
  }
}

void startServer();