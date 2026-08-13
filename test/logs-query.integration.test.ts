import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import { buildApp } from '../src/app.js';
import { pool } from '../src/database/pool.js';

const TEST_SERVICE = 'query-integration-suite';

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
        ($1, 'info', $4, 'Payment started', '{"region":"eu"}'),
        ($2, 'error', $4, 'Payment failed', '{"region":"eu"}'),
        ($3, 'warn', $4, 'Gateway slow', '{"region":"us"}')
    `,
    [
      '2026-08-10T10:00:00Z',
      '2026-08-10T10:01:00Z',
      '2026-08-10T10:02:00Z',
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

describe('GET /logs integration', () => {
  it('returns logs newest first', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: `/logs?service=${TEST_SERVICE}`
    });

    const body = response.json();

    expect(response.statusCode).toBe(200);

    expect(body.logs.map(
      (log: { message: string }) => log.message
    )).toEqual([
      'Gateway slow',
      'Payment failed',
      'Payment started'
    ]);

    await app.close();
  });

  it('combines filters', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url:
        `/logs?service=${TEST_SERVICE}` +
        '&level=error' +
        '&attr.region=eu' +
        '&q=payment'
    });

    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].message).toBe('Payment failed');

    await app.close();
  });

  it('supports cursor pagination', async () => {
    const app = buildApp();

    const first = await app.inject({
      method: 'GET',
      url: `/logs?service=${TEST_SERVICE}&limit=2`
    });

    const firstBody = first.json();

    expect(firstBody.logs).toHaveLength(2);
    expect(firstBody.next_cursor).not.toBeNull();

    const second = await app.inject({
      method: 'GET',
      url:
        `/logs?service=${TEST_SERVICE}` +
        `&limit=2` +
        `&cursor=${encodeURIComponent(
          firstBody.next_cursor
        )}`
    });

    const secondBody = second.json();

    expect(secondBody.logs).toHaveLength(1);
    expect(secondBody.next_cursor).toBeNull();

    await app.close();
  });

  it('treats SQL injection text as normal data', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url:
        '/logs?service=' +
        encodeURIComponent(
          `${TEST_SERVICE}' OR '1'='1`
        )
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().logs).toEqual([]);

    await app.close();
  });
});