export async function up(pgm) {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS logs_service_timestamp_id_idx
    ON logs (
      service,
      timestamp DESC,
      id DESC
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS logs_service_timestamp_id_idx;
  `);
}
