export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE log_rollups_minute (
      bucket_start TIMESTAMPTZ NOT NULL,
      service TEXT NOT NULL,
      level TEXT NOT NULL,
      count BIGINT NOT NULL CHECK (count >= 0),

      PRIMARY KEY (
        bucket_start,
        service,
        level
      )
    );

    INSERT INTO log_rollups_minute (
      bucket_start,
      service,
      level,
      count
    )
    SELECT
      date_trunc('minute', timestamp),
      service,
      level,
      COUNT(*)
    FROM logs
    GROUP BY
      1,
      2,
      3;
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE log_rollups_minute;
  `);
}
