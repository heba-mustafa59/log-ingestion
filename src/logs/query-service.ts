import { encodeCursor } from './cursor.js';
import {
  fetchLogs,
  type DatabaseLogRow
} from './query-repository.js';
import type { LogQuery } from './query.js';

export type LogResponse = {
  id: string;
  timestamp: string;
  level: string;
  service: string;
  message: string;
  attributes: Record<string, string | number | boolean>;
};

export type QueryLogsResult = {
  logs: LogResponse[];
  next_cursor: string | null;
};

export async function queryLogs(
  query: LogQuery
): Promise<QueryLogsResult> {
  const rows = await fetchLogs(query);

  const hasMore = rows.length > query.limit;

  const pageRows = hasMore
    ? rows.slice(0, query.limit)
    : rows;

  const logs = pageRows.map(mapLogRow);

  let nextCursor: string | null = null;

  if (hasMore && pageRows.length > 0) {
    const lastRow = pageRows[pageRows.length - 1];

    if (lastRow !== undefined) {
      nextCursor = encodeCursor({
        timestamp: lastRow.timestamp.toISOString(),
        id: lastRow.id
      });
    }
  }

  return {
    logs,
    next_cursor: nextCursor
  };
}

function mapLogRow(row: DatabaseLogRow): LogResponse {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    level: row.level,
    service: row.service,
    message: row.message,
    attributes: row.attributes
  };
}