import type {
  AggregateBucket,
  AggregateQuery
} from './aggregate-query.js';

export type BuiltAggregateQuery = {
  text: string;
  values: unknown[];
};

const bucketIntervals: Record<
  AggregateBucket,
  string
> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '1h': '1 hour',
  '1d': '1 day'
};

export function buildAggregateQuery(
  query: AggregateQuery
): BuiltAggregateQuery {
  const values: unknown[] = [
    bucketIntervals[query.bucket],
    query.since,
    query.until
  ];

  const conditions: string[] = [
    'timestamp >= $2',
    'timestamp < $3'
  ];

  if (query.service !== undefined) {
    values.push(query.service);

    conditions.push(
      `service = $${values.length}`
    );
  }

  if (query.level !== undefined) {
    values.push(query.level);

    conditions.push(
      `level = $${values.length}`
    );
  }

  for (
    const [key, value]
    of Object.entries(query.attributes)
  ) {
    values.push(key);
    const keyParameter =
      `$${values.length}`;

    values.push(value);
    const valueParameter =
      `$${values.length}`;

    conditions.push(
      `attributes ->> ${keyParameter}::text = ${valueParameter}`
    );
  }

  if (query.q !== undefined) {
    values.push(
      `%${escapeLikePattern(query.q)}%`
    );

    conditions.push(
      `message ILIKE $${values.length} ESCAPE '!'`
    );
  }

  const groupExpression =
    query.groupBy === undefined
      ? 'NULL::text'
      : query.groupBy === 'service'
        ? 'service'
        : 'level';

  const groupByClause =
    query.groupBy === undefined
      ? 'GROUP BY 1'
      : 'GROUP BY 1, 2';

  const text = `
    SELECT
      date_bin(
        $1::interval,
        timestamp,
        '1970-01-01 00:00:00+00'
          ::timestamptz
      ) AS bucket_start,

      ${groupExpression}
        AS group_value,

      COUNT(*) AS count

    FROM logs

    WHERE
      ${conditions.join(' AND ')}

    ${groupByClause}

    ORDER BY
      bucket_start ASC
  `;

  return {
    text,
    values
  };
}

export function canUseRollup(
  query: AggregateQuery
): boolean {
  return (
    query.q === undefined &&
    Object.keys(query.attributes).length === 0
  );
}

export function buildRollupAggregateQuery(
  query: AggregateQuery
): BuiltAggregateQuery {
  const fullStart =
    ceilToMinute(query.since);

  const fullEnd =
    floorToMinute(query.until);

  const values: unknown[] = [
    bucketIntervals[query.bucket],
    query.since,
    query.until,
    fullStart,
    fullEnd
  ];

  const rollupConditions: string[] = [
    'bucket_start >= $4',
    'bucket_start < $5'
  ];

  const rawConditions: string[] = [
    'timestamp >= $2',
    'timestamp < $3',
    '(timestamp < $4 OR timestamp >= $5)'
  ];

  if (query.service !== undefined) {
    values.push(query.service);

    const parameter =
      `$${values.length}`;

    rollupConditions.push(
      `service = ${parameter}`
    );

    rawConditions.push(
      `service = ${parameter}`
    );
  }

  if (query.level !== undefined) {
    values.push(query.level);

    const parameter =
      `$${values.length}`;

    rollupConditions.push(
      `level = ${parameter}`
    );

    rawConditions.push(
      `level = ${parameter}`
    );
  }

  const groupExpression =
    query.groupBy === undefined
      ? 'NULL::text'
      : query.groupBy === 'service'
        ? 'service'
        : 'level';

  const groupByClause =
    query.groupBy === undefined
      ? 'GROUP BY 1'
      : 'GROUP BY 1, 2';

  const text = `
    WITH source AS (
      SELECT
        bucket_start AS minute_start,
        service,
        level,
        count

      FROM log_rollups_minute

      WHERE
        ${rollupConditions.join(' AND ')}

      UNION ALL

      SELECT
        date_trunc(
          'minute',
          timestamp
        ) AS minute_start,

        service,
        level,
        COUNT(*) AS count

      FROM logs

      WHERE
        ${rawConditions.join(' AND ')}

      GROUP BY
        1,
        2,
        3
    )

    SELECT
      date_bin(
        $1::interval,
        minute_start,
        '1970-01-01 00:00:00+00'
          ::timestamptz
      ) AS bucket_start,

      ${groupExpression}
        AS group_value,

      SUM(count) AS count

    FROM source

    ${groupByClause}

    ORDER BY
      bucket_start ASC
  `;

  return {
    text,
    values
  };
}

function escapeLikePattern(
  value: string
): string {
  return value
    .replaceAll('!', '!!')
    .replaceAll('%', '!%')
    .replaceAll('_', '!_');
}

function floorToMinute(
  value: string
): string {
  const date = new Date(value);

  date.setUTCSeconds(0, 0);

  return date.toISOString();
}

function ceilToMinute(
  value: string
): string {
  const date = new Date(value);

  if (
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    return date.toISOString();
  }

  date.setUTCSeconds(0, 0);

  date.setUTCMinutes(
    date.getUTCMinutes() + 1
  );

  return date.toISOString();
}