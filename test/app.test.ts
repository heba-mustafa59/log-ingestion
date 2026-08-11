import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('application', () => {
  it('builds successfully', async () => {
    const app = buildApp();

    await app.ready();

    expect(app).toBeDefined();

    await app.close();
  });
});
