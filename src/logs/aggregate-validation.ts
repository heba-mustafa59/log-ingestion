import { z } from 'zod';

import { logLevels } from './schema.js';
import {
  aggregateBuckets,
  aggregateGroups,
  type AggregateBucket,
  type AggregateGroup,
  type AggregateQuery
} from './aggregate-query.js';

const timestampSchema =
  z.iso.datetime({ offset: true });

export function parseAggregateQuery(
  rawQuery: Record<string, unknown>
): AggregateQuery {
  const since = requireString(
    rawQuery.since,
    'since'
  );

  const until = requireString(
    rawQuery.until,
    'until'
  );

  const bucket = requireString(
    rawQuery.bucket,
    'bucket'
  );

  validateTimestamp(since, 'since');
  validateTimestamp(until, 'until');

  if (
    new Date(until).getTime() <=
    new Date(since).getTime()
  ) {
    throw new Error(
      'until must be later than since'
    );
  }

  if (
    !aggregateBuckets.includes(
      bucket as AggregateBucket
    )
  ) {
    throw new Error('invalid bucket');
  }

  const service = optionalString(
    rawQuery.service,
    'service'
  );

  const level = optionalString(
    rawQuery.level,
    'level'
  );

  const q = optionalString(
    rawQuery.q,
    'q'
  );

  if (
    level !== undefined &&
    !logLevels.includes(
      level as (typeof logLevels)[number]
    )
  ) {
    throw new Error('invalid level');
  }

  const rawGroupBy = optionalString(
    rawQuery.group_by,
    'group_by'
  );

  let groupBy: AggregateGroup | undefined;

  if (rawGroupBy !== undefined) {
    if (
      !aggregateGroups.includes(
        rawGroupBy as AggregateGroup
      )
    ) {
      throw new Error('invalid group_by');
    }

    groupBy = rawGroupBy as AggregateGroup;
  }

  const attributes: Record<string, string> = {};

  for (
    const [key, value]
    of Object.entries(rawQuery)
  ) {
    if (!key.startsWith('attr.')) {
      continue;
    }

    if (typeof value !== 'string') {
      throw new Error(
        `${key} must be a string`
      );
    }

    const attributeKey = key.slice(5);

    if (attributeKey.length === 0) {
      throw new Error(
        'attribute key must not be empty'
      );
    }

    attributes[attributeKey] = value;
  }

  return {
    since,
    until,
    bucket: bucket as AggregateBucket,
    groupBy,
    service,
    level,
    q,
    attributes
  };
}

function requireString(
  value: unknown,
  name: string
): string {
  if (typeof value !== 'string') {
    throw new Error(`${name} is required`);
  }

  return value;
}

function optionalString(
  value: unknown,
  name: string
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(
      `${name} must be a string`
    );
  }

  return value;
}

function validateTimestamp(
  value: string,
  name: string
): void {
  if (
    !timestampSchema.safeParse(value).success
  ) {
    throw new Error(`invalid ${name}`);
  }
}