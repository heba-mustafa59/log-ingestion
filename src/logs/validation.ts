import { z } from 'zod';

import type { LogEntry } from './schema.js';

export type RejectedLog = {
  index: number;
  reason: string;
};

export type BatchValidationResult = {
  valid: LogEntry[];
  rejected: RejectedLog[];
};

const timestampSchema =
  z.iso.datetime({ offset: true });

const levels = new Set([
  'debug',
  'info',
  'warn',
  'error'
]);

const MAX_FUTURE_OFFSET_MS =
  5 * 60 * 1000;

export function validateLogBatch(
  logs: unknown[]
): BatchValidationResult {
  const valid: LogEntry[] = [];
  const rejected: RejectedLog[] = [];

  const maxTimestamp =
    Date.now() + MAX_FUTURE_OFFSET_MS;

  for (
    let index = 0;
    index < logs.length;
    index++
  ) {
    const result = validateLog(
      logs[index],
      maxTimestamp
    );

    if (typeof result === 'string') {
      rejected.push({
        index,
        reason: result
      });

      continue;
    }

    valid.push(result);
  }

  return {
    valid,
    rejected
  };
}

function validateLog(
  value: unknown,
  maxTimestamp: number
): LogEntry | string {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return 'log must be an object';
  }

  const log =
    value as Record<string, unknown>;

  if (
    typeof log.timestamp !== 'string' ||
    !timestampSchema.safeParse(
      log.timestamp
    ).success
  ) {
    return 'invalid timestamp';
  }

  const timestamp =
    Date.parse(log.timestamp);

  if (timestamp > maxTimestamp) {
    return 'timestamp must not be more than five minutes in the future';
  }

  if (
    typeof log.level !== 'string' ||
    !levels.has(log.level)
  ) {
    return 'invalid level';
  }

  if (
    typeof log.service !== 'string' ||
    log.service.length === 0
  ) {
    return 'service must not be empty';
  }

  if (
    typeof log.message !== 'string' ||
    log.message.length === 0
  ) {
    return 'message must not be empty';
  }

  const attributes =
    validateAttributes(log.attributes);

  if (typeof attributes === 'string') {
    return attributes;
  }

  return {
    timestamp: log.timestamp,
    level: log.level as LogEntry['level'],
    service: log.service,
    message: log.message,
    attributes
  };
}

function validateAttributes(
  value: unknown
):
  | Record<
      string,
      string | number | boolean
    >
  | string {
  if (value === undefined) {
    return {};
  }

  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return 'attributes must be a flat object';
  }

  const attributes =
    value as Record<string, unknown>;

  for (
    const attributeValue
    of Object.values(attributes)
  ) {
    if (
      typeof attributeValue !== 'string' &&
      typeof attributeValue !== 'number' &&
      typeof attributeValue !== 'boolean'
    ) {
      return 'attributes must contain only string, number, or boolean values';
    }
  }

  return attributes as Record<
    string,
    string | number | boolean
  >;
}