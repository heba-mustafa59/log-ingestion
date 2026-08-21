export async function up(pgm) {
  pgm.sql(`
    CREATE TEMP TABLE compacted_log_rollups
    ON COMMIT DROP
    AS
    SELECT
      bucket_start,
      service,
      level,
      SUM(count)::bigint AS count
    FROM log_rollups_minute
    GROUP BY
      bucket_start,
      service,
      level;

    TRUNCATE TABLE log_rollups_minute;

    INSERT INTO log_rollups_minute (
      bucket_start,
      service,
      level,
      count
    )
    SELECT
      bucket_start,
      service,
      level,
      count
    FROM compacted_log_rollups;

    DROP INDEX IF EXISTS
      log_rollups_minute_lookup_idx;

    ALTER TABLE log_rollups_minute
    ADD CONSTRAINT log_rollups_minute_pkey
    PRIMARY KEY (
      bucket_start,
      service,
      level
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    ALTER TABLE log_rollups_minute
    DROP CONSTRAINT IF EXISTS
      log_rollups_minute_pkey;

    CREATE INDEX
      log_rollups_minute_lookup_idx
    ON log_rollups_minute (
      bucket_start,
      service,
      level
    );
  `);
}
