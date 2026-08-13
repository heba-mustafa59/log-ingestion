import type { PoolClient } from 'pg';

import { env } from '../config/env.js';
import { pool } from './pool.js';

const FUTURE_PARTITION_DAYS = 7;

const DEFAULT_CLEANUP_BATCH_SIZE = 10_000;
const DEFAULT_CLEANUP_MAX_BATCHES = 10;

const PARTITION_NAME_PATTERN =
  /^logs_(\d{4})(\d{2})(\d{2})$/;

const MAINTENANCE_LOCK_ID = 7348291;

export async function runPartitionMaintenance(
  now = new Date()
): Promise<void> {
  const client = await pool.connect();

  try {
    const lockResult = await client.query<{
      locked: boolean;
    }>(
      `
        SELECT pg_try_advisory_lock($1)
        AS locked
      `,
      [MAINTENANCE_LOCK_ID]
    );

    if (!lockResult.rows[0]?.locked) {
      return;
    }

    try {
      await ensurePartitions(client, now);
      await dropExpiredPartitions(client, now);
      await cleanupDefaultPartition(client, now);
    } finally {
      await client.query(
        'SELECT pg_advisory_unlock($1)',
        [MAINTENANCE_LOCK_ID]
      );
    }
  } finally {
    client.release();
  }
}

async function ensurePartitions(
  client: PoolClient,
  now: Date
): Promise<void> {
  const existingPartitions =
    await getDailyPartitionNames(client);

  const today = startOfUtcDay(now);

  const firstRequiredDay = addUtcDays(
    today,
    -env.retentionDays
  );

  const lastRequiredDay = addUtcDays(
    today,
    FUTURE_PARTITION_DAYS
  );

  for (
    let day = firstRequiredDay;
    day <= lastRequiredDay;
    day = addUtcDays(day, 1)
  ) {
    const partitionName =
      getPartitionName(day);

    if (
      existingPartitions.has(partitionName)
    ) {
      continue;
    }

    const nextDay = addUtcDays(day, 1);

    const from = formatUtcDate(day);
    const to = formatUtcDate(nextDay);

    const safePartitionName =
      quotePartitionName(partitionName);

    await client.query(`
      CREATE TABLE ${safePartitionName}
      PARTITION OF logs
      FOR VALUES FROM (
        '${from} 00:00:00+00'
      )
      TO (
        '${to} 00:00:00+00'
      )
    `);
  }
}

async function dropExpiredPartitions(
  client: PoolClient,
  now: Date
): Promise<void> {
  const partitions =
    await getDailyPartitionNames(client);

  const cutoffDay = addUtcDays(
    startOfUtcDay(now),
    -env.retentionDays
  );

  for (const partitionName of partitions) {
    const partitionDate =
      getDateFromPartitionName(
        partitionName
      );

    if (partitionDate >= cutoffDay) {
      continue;
    }

    const safePartitionName =
      quotePartitionName(partitionName);

    await client.query(`
      DROP TABLE ${safePartitionName}
    `);
  }
}

async function cleanupDefaultPartition(
  client: PoolClient,
  now: Date
): Promise<void> {
  const cutoff = new Date(
    now.getTime() -
      env.retentionDays *
        24 *
        60 *
        60 *
        1000
  );

  for (
    let batch = 0;
    batch < DEFAULT_CLEANUP_MAX_BATCHES;
    batch++
  ) {
    const result = await client.query(
      `
        WITH doomed AS (
          SELECT ctid
          FROM logs_default
          WHERE timestamp < $1
          LIMIT $2
        )
        DELETE FROM logs_default AS logs
        USING doomed
        WHERE logs.ctid = doomed.ctid
      `,
      [
        cutoff.toISOString(),
        DEFAULT_CLEANUP_BATCH_SIZE
      ]
    );

    if (
      (result.rowCount ?? 0) <
      DEFAULT_CLEANUP_BATCH_SIZE
    ) {
      break;
    }
  }
}

async function getDailyPartitionNames(
  client: PoolClient
): Promise<Set<string>> {
  const result = await client.query<{
    partition_name: string;
  }>(`
    SELECT child.relname AS partition_name
    FROM pg_inherits
    JOIN pg_class AS child
      ON child.oid = inhrelid
    WHERE inhparent = 'logs'::regclass
  `);

  return new Set(
    result.rows
      .map((row) => row.partition_name)
      .filter((name) =>
        PARTITION_NAME_PATTERN.test(name)
      )
  );
}

function getPartitionName(
  date: Date
): string {
  return `logs_${formatUtcDate(date).replaceAll(
    '-',
    ''
  )}`;
}

function getDateFromPartitionName(
  name: string
): Date {
  const match =
    PARTITION_NAME_PATTERN.exec(name);

  if (match === null) {
    throw new Error(
      `invalid partition name: ${name}`
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );
}

function quotePartitionName(
  name: string
): string {
  if (
    !PARTITION_NAME_PATTERN.test(name)
  ) {
    throw new Error(
      `unsafe partition name: ${name}`
    );
  }

  return `"${name}"`;
}

function startOfUtcDay(
  date: Date
): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );
}

function addUtcDays(
  date: Date,
  days: number
): Date {
  const result = new Date(
    date.getTime()
  );

  result.setUTCDate(
    result.getUTCDate() + days
  );

  return result;
}

function formatUtcDate(
  date: Date
): string {
  return date
    .toISOString()
    .slice(0, 10);
}
/*runPartitionMaintenance()
          ↓
┌─────────┼───────────────┐
↓         ↓               ↓
ensure    drop old        clean
partitions partitions     default*/