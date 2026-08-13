function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    throw new Error(
      `${name} must be a positive integer`
    );
  }

  return parsed;
}

export const env = {
  port: 8080,
  host: '0.0.0.0',

  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5433/log_ingestion',

  retentionDays: readPositiveInteger(
    process.env.RETENTION_DAYS,
    30,
    'RETENTION_DAYS'
  )
};