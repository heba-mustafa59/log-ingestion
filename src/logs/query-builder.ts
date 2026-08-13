import type { LogQuery } from './query.js';

export type BuiltLogQuery = {
  text: string;
  values: unknown[];
};

export function buildLogQuery(query: LogQuery): BuiltLogQuery {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (query.service !== undefined) {
    values.push(query.service);
    conditions.push(`service = $${values.length}`);
  }

  if (query.level !== undefined) {
    values.push(query.level);
    conditions.push(`level = $${values.length}`);
  }

  if (query.since !== undefined) {
    values.push(query.since);
    conditions.push(`timestamp >= $${values.length}`);
  }

  if (query.until !== undefined) {
    values.push(query.until);
    conditions.push(`timestamp < $${values.length}`);
  }

  for (const [key, value] of Object.entries(query.attributes)) {
    values.push(key);
    const keyParameter = `$${values.length}`;

    values.push(value);
    const valueParameter = `$${values.length}`;

    conditions.push(
  `attributes ->> ${keyParameter}::text = ${valueParameter}`);
   //key is always text 
}

  if (query.q !== undefined) {
    values.push(`%${escapeLikePattern(query.q)}%`);

    conditions.push(
      `message ILIKE $${values.length} ESCAPE '!'`
    );
  }
  if (query.cursor !== undefined) {
  values.push(query.cursor.timestamp);
  const timestampParameter = `$${values.length}`;

  values.push(query.cursor.id);
  const idParameter = `$${values.length}`;

  conditions.push(`
    (
      timestamp < ${timestampParameter}
      OR (
        timestamp = ${timestampParameter}
        AND id < ${idParameter}::bigint
      )
    )
  `);//timestamp DESC, id DESC
}

  let text = `
    SELECT
      id,
      timestamp,
      level,
      service,
      message,
      attributes
    FROM logs
  `;

  if (conditions.length > 0) {
    text += `
      WHERE ${conditions.join(' AND ')}
    `;
  }

  text += `
    ORDER BY timestamp DESC, id DESC
  `;

  values.push(query.limit + 1);

  text += `
    LIMIT $${values.length}
  `;// to know is there any other page?

  return {
    text,
    values
  };
}

function escapeLikePattern(value: string): string {
  return value
    .replaceAll('!', '!!')
    .replaceAll('%', '!%')
    .replaceAll('_', '!_');
}