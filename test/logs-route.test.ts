import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('POST /logs', () => {
  it('returns 400 when logs array is missing', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/logs',
      payload: {}
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 400 for an empty logs array', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/logs',
      payload: {
        logs: []
      }
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 400 when all entries are invalid', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/logs',
      payload: {
        logs: [
          {
            timestamp: 'bad-date',
            level: 'critical',
            service: '',
            message: ''
          }
        ]
      }
    });

    const body = response.json();

    expect(response.statusCode).toBe(400);
    expect(body.accepted).toBe(0);
    expect(body.rejected).toHaveLength(1);

    await app.close();
  });
});
