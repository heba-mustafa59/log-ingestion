export const env = {
  port: 8080,
  host: '0.0.0.0',

  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5433/log_ingestion'
};
