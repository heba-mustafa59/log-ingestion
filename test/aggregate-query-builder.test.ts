import {
  describe,
  expect,
  it
} from 'vitest';

import {
  buildAggregateQuery
} from '../src/logs/aggregate-query-builder.js';

describe('aggregate query builder', () => {
  it('builds an ungrouped aggregation', () => {
    const result = buildAggregateQuery({
      since: '2026-08-13T10:00:00Z',
      until: '2026-08-13T11:00:00Z',
      bucket: '1m',
      attributes: {}
    });

    expect(result.text).toContain('date_bin');
    expect(result.text).toContain('COUNT(*)');
    expect(result.text).toContain(
      'NULL::text AS group_value'
    );

    expect(result.values).toEqual([
      '1 minute',
      '2026-08-13T10:00:00Z',
      '2026-08-13T11:00:00Z'
    ]);
  });

  it('groups by service', () => {
    const result = buildAggregateQuery({
      since: '2026-08-13T10:00:00Z',
      until: '2026-08-13T11:00:00Z',
      bucket: '5m',
      groupBy: 'service',
      attributes: {}
    });

    expect(result.text).toContain(
      'service AS group_value'
    );

    expect(result.text).toContain(
      'GROUP BY 1, 2'
    );
  });

  it('applies shared filters', () => {
    const result = buildAggregateQuery({
      since: '2026-08-13T10:00:00Z',
      until: '2026-08-13T11:00:00Z',
      bucket: '1h',
      service: 'checkout',
      level: 'error',
      attributes: {
        region: 'eu'
      }
    });

    expect(result.text).toContain(
      'service = $4'
    );

    expect(result.text).toContain(
      'level = $5'
    );

    expect(result.text).toContain(
      'attributes ->> $6::text = $7'
    );
  });
});