import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import { buildApp } from '../src/app.js';
import { pool } from '../src/database/pool.js';

const TEST_SERVICE =
  'aggregate-integration-suite';

beforeAll(async () => {
  // Clean leftovers
  await pool.query(
    'DELETE FROM logs WHERE service = $1',
    [TEST_SERVICE]
  );

  await pool.query(
    `
      DELETE FROM log_rollups_minute
      WHERE service = $1
    `,
    [TEST_SERVICE]
  );

  // Important:
  // Insert through POST /logs,
  // not directly with SQL.
  const app = buildApp();

  const response = await app.inject({
    method: 'POST',
    url: '/logs',
    payload: {
      logs: [
        {
          timestamp:
            '2026-08-10T10:00:10Z',
          level: 'info',
          service: TEST_SERVICE,
          message: 'one'
        },
        {
          timestamp:
            '2026-08-10T10:00:30Z',
          level: 'error',
          service: TEST_SERVICE,
          message: 'two'
        },
        {
          timestamp:
            '2026-08-10T10:01:10Z',
          level: 'error',
          service: TEST_SERVICE,
          message: 'three'
        }
      ]
    }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().accepted).toBe(3);

  // Temporary diagnostic:
  // prove that POST /logs updated the rollup table.
  const rollups = await pool.query(
    `
      SELECT
        bucket_start,
        service,
        level,
        count
      FROM log_rollups_minute
      WHERE service = $1
      ORDER BY bucket_start, level
    `,
    [TEST_SERVICE]
  );

  expect(rollups.rows).toHaveLength(3);

  await app.close();
});

afterAll(async () => {
  await pool.query(
    'DELETE FROM logs WHERE service = $1',
    [TEST_SERVICE]
  );

  await pool.query(
    `
      DELETE FROM log_rollups_minute
      WHERE service = $1
    `,
    [TEST_SERVICE]
  );
});

describe('GET /logs/aggregate', () => {
  it('aggregates logs into time buckets', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url:
        '/logs/aggregate?' +
        'since=2026-08-10T10:00:00Z' +
        '&until=2026-08-10T10:02:00Z' +
        '&bucket=1m' +
        `&service=${TEST_SERVICE}`
    });

    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.buckets).toHaveLength(2);

    expect(body.buckets[0].count).toBe('2');
    expect(body.buckets[1].count).toBe('1');

    await app.close();
  });

  it('groups aggregation by level', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url:
        '/logs/aggregate?' +
        'since=2026-08-10T10:00:00Z' +
        '&until=2026-08-10T10:02:00Z' +
        '&bucket=1h' +
        '&group_by=level' +
        `&service=${TEST_SERVICE}`
    });

    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.buckets).toHaveLength(2);

    await app.close();
  });
});