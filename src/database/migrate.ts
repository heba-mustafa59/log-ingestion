import { runner } from 'node-pg-migrate';
import { env } from '../config/env.js';

export async function runMigrations(): Promise<void> {
  await runner({
    databaseUrl: env.databaseUrl,
    dir: 'migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    verbose: false
  });
}
