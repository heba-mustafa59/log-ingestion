export async function up(pgm) {
  pgm.sql(`
    CREATE INDEX logs_timestamp_id_idx
    ON logs (timestamp DESC, id DESC)
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX logs_timestamp_id_idx
  `);
}
