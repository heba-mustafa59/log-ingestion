import {
  logEntrySchema,
  type LogEntry
} from './schema.js';

export type RejectedLog = {
  index: number;
  reason: string;
};

export type BatchValidationResult = {
  valid: LogEntry[];
  rejected: RejectedLog[];
};

export function validateLogBatch(
  logs: unknown[]
): BatchValidationResult {
  const valid: LogEntry[] = [];
  const rejected: RejectedLog[] = [];

  logs.forEach((log, index) => {
    const result = logEntrySchema.safeParse(log);

    if (result.success) {
      valid.push(result.data);
      return;
    }

    const reason =
      result.error.issues[0]?.message ??
      'invalid log entry';

    rejected.push({
      index,
      reason
    });
  });

  return {
    valid,
    rejected
  };
}
