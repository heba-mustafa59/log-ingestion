import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import { buildApp } from '../src/app.js';
import { pool } from '../src/database/pool.js';

const TEST_SERVICE = 'aggregate-integration-suite';

beforeAll(async () => {
  await pool.query(
    'DELETE FROM logs WHERE service = $1',
    [TEST_SERVICE]
  );

  await pool.query(
    `
      INSERT INTO logs (
        timestamp,
        level,
        service,
        message,
        attributes
      )
      VALUES
        ($1, 'info', $4, 'one', '{}'),
        ($2, 'error', $4, 'two', '{}'),
        ($3, 'error', $4, 'three', '{}')
    `,
    [
      '2026-08-10T10:00:10Z',
      '2026-08-10T10:00:30Z',
      '2026-08-10T10:01:10Z',
      TEST_SERVICE
    ]
  );
});

afterAll(async () => {
  await pool.query(
    'DELETE FROM logs WHERE service = $1',
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