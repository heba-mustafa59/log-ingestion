import {
  describe,
  expect,
  it
} from 'vitest';

import {
  buildAggregateQuery,
  buildRollupAggregateQuery,
  canUseRollup
} from '../src/logs/aggregate-query-builder.js';

describe('aggregate query builder', () => {
  it('builds a raw aggregation query', () => {
    const result = buildAggregateQuery({
      since: '2026-08-13T10:00:00Z',
      until: '2026-08-13T11:00:00Z',
      bucket: '1m',
      service: 'checkout',
      level: 'error',
      attributes: {}
    });

    expect(result.text).toContain(
      'FROM logs'
    );

    expect(result.text).toContain(
      'COUNT(*)'
    );

    expect(result.text).toContain(
      'service = $4'
    );

    expect(result.text).toContain(
      'level = $5'
    );

    expect(result.values).toEqual([
      '1 minute',
      '2026-08-13T10:00:00Z',
      '2026-08-13T11:00:00Z',
      'checkout',
      'error'
    ]);
  });

  it('uses rollup when filters are supported', () => {
    const result = canUseRollup({
      since: '2026-08-13T10:00:00Z',
      until: '2026-08-13T11:00:00Z',
      bucket: '1m',
      service: 'checkout',
      attributes: {}
    });

    expect(result).toBe(true);
  });

  it('does not use rollup for q or attribute filters', () => {
    const withQuery = canUseRollup({
      since: '2026-08-13T10:00:00Z',
      until: '2026-08-13T11:00:00Z',
      bucket: '1m',
      q: 'payment',
      attributes: {}
    });

    const withAttributes = canUseRollup({
      since: '2026-08-13T10:00:00Z',
      until: '2026-08-13T11:00:00Z',
      bucket: '1m',
      attributes: {
        region: 'eu'
      }
    });

    expect(withQuery).toBe(false);
    expect(withAttributes).toBe(false);
  });

  it('uses rollups for full minutes and raw logs for partial minutes', () => {
    const result = buildRollupAggregateQuery({
      since: '2026-08-13T10:00:37Z',
      until: '2026-08-13T11:00:22Z',
      bucket: '1m',
      service: 'checkout',
      attributes: {}
    });

    expect(result.text).toContain(
      'FROM log_rollups_minute'
    );

    expect(result.text).toContain(
      'FROM logs'
    );

    expect(result.text).toContain(
      'UNION ALL'
    );

    expect(result.values).toEqual([
      '1 minute',
      '2026-08-13T10:00:37Z',
      '2026-08-13T11:00:22Z',
      '2026-08-13T10:01:00.000Z',
      '2026-08-13T11:00:00.000Z',
      'checkout'
    ]);
  });
});