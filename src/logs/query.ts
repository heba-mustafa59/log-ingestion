 import type { LogCursor } from './cursor.js';

export type LogQuery = {
  service?: string;
  level?: string;
  since?: string;
  until?: string;
  q?: string;
  limit: number;
  cursor?: LogCursor;
  attributes: Record<string, string>;
};