import { describe, expect, it } from 'vitest';
import { parseLogQuery } from '../src/logs/query-validation.js';

describe('log query validation', () => {
  it('uses default limit 100', () => {
    const query = parseLogQuery({});

    expect(query.limit).toBe(100);
  });

  it('accepts a valid limit', () => {
    const query = parseLogQuery({
      limit: '500'
    });

    expect(query.limit).toBe(500);
  });

  it('rejects a limit below 1', () => {
    expect(() =>
      parseLogQuery({
        limit: '0'
      })
    ).toThrow();
  });

  it('rejects a limit above 1000', () => {
    expect(() =>
      parseLogQuery({
        limit: '1001'
      })
    ).toThrow();
  });

  it('rejects a non-numeric limit', () => {
    expect(() =>
      parseLogQuery({
        limit: 'abc'
      })
    ).toThrow();
  });

  it('rejects an unsupported level', () => {
    expect(() =>
      parseLogQuery({
        level: 'critical'
      })
    ).toThrow();
  });

  it('rejects an invalid since timestamp', () => {
    expect(() =>
      parseLogQuery({
        since: 'bad-date'
      })
    ).toThrow();
  });

  it('rejects an invalid until timestamp', () => {
    expect(() =>
      parseLogQuery({
        until: 'bad-date'
      })
    ).toThrow();
  });

  it('rejects until equal to since', () => {
    expect(() =>
      parseLogQuery({
        since: '2026-08-12T10:00:00Z',
        until: '2026-08-12T10:00:00Z'
      })
    ).toThrow();
  });

  it('rejects until earlier than since', () => {
    expect(() =>
      parseLogQuery({
        since: '2026-08-12T10:00:00Z',
        until: '2026-08-12T09:00:00Z'
      })
    ).toThrow();
  });

  it('extracts attribute filters', () => {
    const query = parseLogQuery({
      'attr.user_id': '42',
      'attr.region': 'eu-west'
    });

    expect(query.attributes).toEqual({
      user_id: '42',
      region: 'eu-west'
    });
  });

  it('rejects an empty attribute key', () => {
    expect(() =>
      parseLogQuery({
        'attr.': '42'
      })
    ).toThrow();
  });
});