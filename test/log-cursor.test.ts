import { describe, expect, it } from 'vitest';
import {
  decodeCursor,
  encodeCursor
} from '../src/logs/cursor.js';

describe('log cursor', () => {
  it('encodes and decodes a cursor', () => {
    const cursor = {
      timestamp: '2026-08-13T10:30:00Z',
      id: '42'
    };

    const encoded = encodeCursor(cursor);
    const decoded = decodeCursor(encoded);

    expect(decoded).toEqual(cursor);
  });

  it('rejects a malformed cursor', () => {
    expect(() =>
      decodeCursor('not-a-valid-cursor')
    ).toThrow('invalid cursor');
  });

  it('rejects a cursor with an invalid id', () => {
    const encoded = Buffer
      .from(
        JSON.stringify({
          timestamp: '2026-08-13T10:30:00Z',
          id: 'abc'
        })
      )
      .toString('base64url');

    expect(() =>
      decodeCursor(encoded)
    ).toThrow('invalid cursor');
  });
});