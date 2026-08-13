import type {
  AggregateBucket,
  AggregateQuery
} from './aggregate-query.js';

export type BuiltAggregateQuery = {
  text: string;
  values: unknown[];
};

const bucketIntervals: Record<AggregateBucket, string> = {
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
    const keyParameter = `$${values.length}`;

    values.push(value);
    const valueParameter = `$${values.length}`;

    conditions.push(
      `attributes ->> ${keyParameter}::text = ${valueParameter}`
    );
  }

  if (query.q !== undefined) {
    values.push(`%${escapeLikePattern(query.q)}%`);

    conditions.push(
      `message ILIKE $${values.length} ESCAPE '!'`
    );
  }

  const groupExpression =
    query.groupBy === undefined
      ? 'NULL::text'
      : query.groupBy;

  const groupByClause =
    query.groupBy === undefined
      ? 'GROUP BY 1'
      : 'GROUP BY 1, 2';

  const text = `
    SELECT
      date_bin(
        $1::interval,
        timestamp,
        '1970-01-01 00:00:00+00'::timestamptz
      ) AS bucket_start,
      ${groupExpression} AS group_value,
      COUNT(*) AS count
    FROM logs
    WHERE ${conditions.join(' AND ')}
    ${groupByClause}
    ORDER BY bucket_start ASC
  `;

  return {
    text,
    values
  };
}

function escapeLikePattern(value: string): string {
  return value
    .replaceAll('!', '!!')
    .replaceAll('%', '!%')
    .replaceAll('_', '!_');
}