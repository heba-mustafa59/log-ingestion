import { logLevels } from './schema.js';
import type { LogQuery } from './query.js';
import { z } from 'zod';
import { decodeCursor } from './cursor.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const timestampSchema = z.iso.datetime({ offset: true });

export function parseLogQuery(
  rawQuery: Record<string, unknown>
): LogQuery {
  const attributes: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawQuery)) {
    if (!key.startsWith('attr.')) {
      continue;
    }

    if (typeof value !== 'string') {
      throw new Error(`${key} must be a string`);
    }

    const attributeKey = key.slice(5);

    if (attributeKey.length === 0) {
      throw new Error('attribute key must not be empty');
    }

    attributes[attributeKey] = value;
  }

  const service = readOptionalString(rawQuery.service, 'service');
  const level = readOptionalString(rawQuery.level, 'level');
  const since = readOptionalString(rawQuery.since, 'since');
  const until = readOptionalString(rawQuery.until, 'until');
  const q = readOptionalString(rawQuery.q, 'q');
 const rawCursor = readOptionalString(
  rawQuery.cursor,
  'cursor'
);

const cursor =
  rawCursor === undefined
    ? undefined
    : decodeCursor(rawCursor);
  if (
    level !== undefined &&
    !logLevels.includes(level as (typeof logLevels)[number])
  ) {
    throw new Error('invalid level');
  }

  validateTimestamp(since, 'since');
  validateTimestamp(until, 'until');

  if (
    since !== undefined &&
    until !== undefined &&
    new Date(until).getTime() <= new Date(since).getTime()
  ) {
    throw new Error('until must be later than since');
  }

  const limit = parseLimit(rawQuery.limit);

  return {
    service,
    level,
    since,
    until,
    q,
    limit,
    cursor,
    attributes
  };
}

function readOptionalString(
  value: unknown,
  name: string
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string`);
  }

  return value;
}

function validateTimestamp(
  value: string | undefined,
  name: string
): void {
  if (value === undefined) {
    return;
  }

  if (!timestampSchema.safeParse(value).success) {
    throw new Error(`invalid ${name}`);
  }
}

function parseLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value)
  ) {
    throw new Error(' numeric only ');
  }

  const limit = Number(value);

  if (limit < 1 || limit > MAX_LIMIT) {
    throw new Error('limit  is between 1 and 1000');
  }

  return limit;
} 