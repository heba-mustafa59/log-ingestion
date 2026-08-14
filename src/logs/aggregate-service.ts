import { fetchAggregation } from './aggregate-repository.js';
import type { AggregateQuery } from './aggregate-query.js';

export type AggregateBucketResult = {
  start: string;
  group: string | null;
  count: number;
};

export type AggregateResponse = {
  buckets: AggregateBucketResult[];
};

export async function aggregateLogs(
  query: AggregateQuery
): Promise<AggregateResponse> {
  const rows = await fetchAggregation(query);

  return {
    buckets: rows.map((row) => ({
      start: row.bucket_start.toISOString(),
      group: row.group_value,
      count: Number(row.count)
    }))
  };
}