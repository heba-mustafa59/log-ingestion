import {
  describe,
  expect,
  it
} from 'vitest';

import {
  parseAggregateQuery
} from '../src/logs/aggregate-validation.js';

const baseQuery = {
  since: '2026-08-13T10:00:00Z',
  until: '2026-08-13T11:00:00Z',
  bucket: '1m'
};

describe('aggregate query validation', () => {
  it('accepts a valid query', () => {
    const result =
      parseAggregateQuery(baseQuery);

    expect(result.bucket).toBe('1m');
  });

  it('rejects a missing since', () => {
    expect(() =>
      parseAggregateQuery({
        until: baseQuery.until,
        bucket: baseQuery.bucket
      })
    ).toThrow();
  });

  it('rejects an invalid bucket', () => {
    expect(() =>
      parseAggregateQuery({
        ...baseQuery,
        bucket: '10m'
      })
    ).toThrow('invalid bucket');
  });

  it('rejects an invalid group_by', () => {
    expect(() =>
      parseAggregateQuery({
        ...baseQuery,
        group_by: 'message'
      })
    ).toThrow('invalid group_by');
  });

  it('rejects until before since', () => {
    expect(() =>
      parseAggregateQuery({
        ...baseQuery,
        until: '2026-08-13T09:00:00Z'
      })
    ).toThrow();
  });
});