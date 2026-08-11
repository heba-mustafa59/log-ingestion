import { pool } from '../database/pool.js';
import type { LogEntry } from './schema.js';

const INSERT_CHUNK_SIZE = 1000;

export async function insertLogs(logs: LogEntry[]): Promise<void> {
  if (logs.length === 0) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (let start = 0; start < logs.length; start += INSERT_CHUNK_SIZE) {
      const chunk = logs.slice(start, start + INSERT_CHUNK_SIZE);

      const values: unknown[] = [];

      const placeholders = chunk.map((log, index) => {
        const offset = index * 5;

        values.push(
          log.timestamp,
          log.level,
          log.service,
          log.message,
          JSON.stringify(log.attributes)
        );

        return `(
          $${offset + 1},
          $${offset + 2},
          $${offset + 3},
          $${offset + 4},
          $${offset + 5}::jsonb
        )`;
      });

      const query = `
        INSERT INTO logs (
          timestamp,
          level,
          service,
          message,
          attributes
        )
        VALUES ${placeholders.join(',')}
      `;

      await client.query(query, values);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
