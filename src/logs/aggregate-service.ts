import {
  fetchAggregation,
  type DatabaseAggregateRow
} from './aggregate-repository.js';

import type { AggregateQuery } from './aggregate-query.js';

export type AggregateBucketResponse = {
  start: string;
  group: string | null;
  count: string;
};

export type AggregateResponse = {
  buckets: AggregateBucketResponse[];
};

export async function aggregateLogs(
  query: AggregateQuery
): Promise<AggregateResponse> {
  const rows = await fetchAggregation(query);

  return {
    buckets: rows.map(mapAggregateRow)
  };
}

function mapAggregateRow(
  row: DatabaseAggregateRow
): AggregateBucketResponse {
  return {
    start: row.bucket_start.toISOString(),
    group: row.group_value,
    count: row.count
  };
}