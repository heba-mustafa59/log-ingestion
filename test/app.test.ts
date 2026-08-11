import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('application', () => {
  it('builds successfully', async () => {
    const app = buildApp();

    await app.ready();

    expect(app).toBeDefined();

    await app.close();
  });

  it('returns 200 from GET /health', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });
});
