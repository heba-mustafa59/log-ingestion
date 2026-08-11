import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10
});

export async function checkDatabaseConnection(): Promise<void> {
  await pool.query('SELECT 1');
}
