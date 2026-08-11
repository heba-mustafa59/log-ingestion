export async function up(pgm) {
  pgm.createTable('logs', {
    id: {
      type: 'bigserial',
      primaryKey: true
    },

    timestamp: {
      type: 'timestamptz',
      notNull: true
    },

    level: {
      type: 'text',
      notNull: true
    },

    service: {
      type: 'text',
      notNull: true
    },

    message: {
      type: 'text',
      notNull: true
    },

    attributes: {
      type: 'jsonb',
      notNull: true,
      default: '{}'
    }
  });
}

export async function down(pgm) {
  pgm.dropTable('logs');
}
