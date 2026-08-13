import { pool } from '../database/pool.js';
import { buildLogQuery } from './query-builder.js';
import type { LogQuery } from './query.js';

export type DatabaseLogRow = {
  id: string;
  timestamp: Date;
  level: string;
  service: string;
  message: string;
  attributes: Record<string, string | number | boolean>;
};

export async function fetchLogs(
  query: LogQuery
): Promise<DatabaseLogRow[]> {
  const builtQuery = buildLogQuery(query);

  const result = await pool.query<DatabaseLogRow>(
    builtQuery.text,
    builtQuery.values
  );

  return result.rows;
}