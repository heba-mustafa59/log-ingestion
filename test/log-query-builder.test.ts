import { describe, expect, it } from 'vitest';
import { buildLogQuery } from '../src/logs/query-builder.js';

describe('log query builder', () => {
  it('builds a query without filters', () => {
    const result = buildLogQuery({
      limit: 100,
      attributes: {}
    });

    expect(result.text).toContain(
      'ORDER BY timestamp DESC, id DESC'
    );

    expect(result.values).toEqual([101]);
  });

  it('builds service and level filters', () => {
    const result = buildLogQuery({
      service: 'checkout',
      level: 'error',
      limit: 100,
      attributes: {}
    });

    expect(result.text).toContain('service = $1');
    expect(result.text).toContain('level = $2');

    expect(result.values).toEqual([
      'checkout',
      'error',
      101
    ]);
  });

  it('uses inclusive since and exclusive until', () => {
    const result = buildLogQuery({
      since: '2026-08-12T10:00:00Z',
      until: '2026-08-12T11:00:00Z',
      limit: 100,
      attributes: {}
    });

    expect(result.text).toContain('timestamp >= $1');
    expect(result.text).toContain('timestamp < $2');
  });

  it('builds attribute filters', () => {
    const result = buildLogQuery({
      limit: 100,
      attributes: {
        region: 'eu-west'
      }
    });

    expect(result.text).toContain(
      'attributes ->> $1::text = $2'
    );

    expect(result.values).toEqual([
      'region',
      'eu-west',
      101
    ]);
  });

  it('builds message substring search', () => {
    const result = buildLogQuery({
      q: 'payment',
      limit: 100,
      attributes: {}
    });

    expect(result.text).toContain('message ILIKE $1');

    expect(result.values).toEqual([
      '%payment%',
      101
    ]);
  });
});
it('builds cursor pagination condition', () => {
  const result = buildLogQuery({
    limit: 100,
    attributes: {},
    cursor: {
      timestamp: '2026-08-13T10:30:00Z',
      id: '42'
    }
  });

  expect(result.text).toContain('timestamp < $1');
  expect(result.text).toContain('timestamp = $1');
  expect(result.text).toContain('id < $2::bigint');

  expect(result.values).toEqual([
    '2026-08-13T10:30:00Z',
    '42',
    101
  ]);
});