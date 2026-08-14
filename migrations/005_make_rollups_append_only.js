export async function up(pgm) {
  pgm.sql(`
    ALTER TABLE log_rollups_minute
    DROP CONSTRAINT log_rollups_minute_pkey;

    CREATE INDEX log_rollups_minute_lookup_idx
    ON log_rollups_minute (
      bucket_start,
      service,
      level
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX log_rollups_minute_lookup_idx;

    DELETE FROM log_rollups_minute a
    USING log_rollups_minute b
    WHERE
      a.ctid < b.ctid
      AND a.bucket_start = b.bucket_start
      AND a.service = b.service
      AND a.level = b.level;

    ALTER TABLE log_rollups_minute
    ADD PRIMARY KEY (
      bucket_start,
      service,
      level
    );
  `);
}