export const aggregateBuckets = [
  '1m',
  '5m',
  '1h',
  '1d'
] as const;

export type AggregateBucket =
  (typeof aggregateBuckets)[number];

export const aggregateGroups = [
  'service',
  'level'
] as const;

export type AggregateGroup =
  (typeof aggregateGroups)[number];

export type AggregateQuery = {
  since: string;
  until: string;
  bucket: AggregateBucket;
  groupBy?: AggregateGroup;

  service?: string;
  level?: string;
  q?: string;

  attributes: Record<string, string>;
};