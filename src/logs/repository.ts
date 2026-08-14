import { pool } from '../database/pool.js';
import type { LogEntry } from './schema.js';

const INSERT_LOGS_QUERY = `
  WITH input AS (
    SELECT *
    FROM jsonb_to_recordset($1::jsonb)
    AS record(
      timestamp timestamptz,
      level text,
      service text,
      message text,
      attributes jsonb
    )
  ),

  inserted AS (
    INSERT INTO logs (
      timestamp,
      level,
      service,
      message,
      attributes
    )
    SELECT
      timestamp,
      level,
      service,
      message,
      COALESCE(
        attributes,
        '{}'::jsonb
      )
    FROM input

    RETURNING
      timestamp,
      service,
      level
  ),

  inserted_rollups AS (
    INSERT INTO log_rollups_minute (
      bucket_start,
      service,
      level,
      count
    )
    SELECT
      date_trunc(
        'minute',
        timestamp
      ),
      service,
      level,
      COUNT(*)
    FROM inserted
    GROUP BY
      1,
      2,
      3

    RETURNING 1
  )

  SELECT COUNT(*)
  FROM inserted
`;

export async function insertLogs(
  logs: LogEntry[]
): Promise<void> {
  if (logs.length === 0) {
    return;
  }

  await pool.query(
    INSERT_LOGS_QUERY,
    [JSON.stringify(logs)]
  );
}