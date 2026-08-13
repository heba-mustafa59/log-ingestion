import { pool } from '../database/pool.js';
import { buildAggregateQuery } from './aggregate-query-builder.js';
import type { AggregateQuery } from './aggregate-query.js';

export type DatabaseAggregateRow = {
  bucket_start: Date;
  group_value: string | null;
  count: string;
};

export async function fetchAggregation(
  query: AggregateQuery
): Promise<DatabaseAggregateRow[]> {
  const builtQuery = buildAggregateQuery(query);

  const result = await pool.query<DatabaseAggregateRow>(
    builtQuery.text,
    builtQuery.values
  );

  return result.rows;
}