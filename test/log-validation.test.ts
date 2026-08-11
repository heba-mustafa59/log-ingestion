import { describe, expect, it } from 'vitest';
import { validateLogBatch } from '../src/logs/validation.js';

const validLog = {
  timestamp: new Date().toISOString(),
  level: 'info',
  service: 'checkout',
  message: 'payment processed',
  attributes: {
    user_id: '42',
    retries: 2,
    cached: false
  }
};

describe('log validation', () => {
  it('accepts a valid log', () => {
    const result = validateLogBatch([validLog]);

    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects an invalid level', () => {
    const result = validateLogBatch([
      {
        ...validLog,
        level: 'critical'
      }
    ]);

    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.index).toBe(0);
  });

  it('rejects nested attributes', () => {
    const result = validateLogBatch([
      {
        ...validLog,
        attributes: {
          user: {
            id: 42
          }
        }
      }
    ]);

    expect(result.rejected).toHaveLength(1);
  });

  it('supports partially valid batches', () => {
    const result = validateLogBatch([
      validLog,
      {
        ...validLog,
        level: 'critical'
      },
      validLog
    ]);

    expect(result.valid).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.index).toBe(1);
  });

  it('rejects a future timestamp beyond five minutes', () => {
    const future = new Date(Date.now() + 6 * 60 * 1000).toISOString();

    const result = validateLogBatch([
      {
        ...validLog,
        timestamp: future
      }
    ]);

    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
  });

  it('rejects an empty service', () => {
    const result = validateLogBatch([
      {
        ...validLog,
        service: ''
      }
    ]);

    expect(result.rejected).toHaveLength(1);
  });

  it('rejects an empty message', () => {
    const result = validateLogBatch([
      {
        ...validLog,
        message: ''
      }
    ]);

    expect(result.rejected).toHaveLength(1);
  });

  it('rejects array attributes', () => {
    const result = validateLogBatch([
      {
        ...validLog,
        attributes: {
          roles: ['admin']
        }
      }
    ]);

    expect(result.rejected).toHaveLength(1);
  });

  it('accepts a log without attributes', () => {
    const {
      attributes: _,
      ...logWithoutAttributes
    } = validLog;

    const result = validateLogBatch([
      logWithoutAttributes
    ]);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]?.attributes).toEqual({});
  });
});
