import type { LogEntry } from './schema.js';
import { insertLogs } from './repository.js';

const TARGET_DATABASE_BATCH_LOGS = 1000;
const MAX_BATCH_DELAY_MS = 100;

const MAX_CONCURRENT_DATABASE_BATCHES = 2;

const MAX_OUTSTANDING_LOGS = 50_000;
const MAX_OUTSTANDING_REQUESTS = 2_000;

type PendingIngestion = {
  logs: LogEntry[];
  enqueuedAt: number;
  resolve: () => void;
  reject: (error: unknown) => void;
};

let pendingRequests: PendingIngestion[] = [];
let queueHead = 0;

let queuedLogs = 0;

let inFlightLogs = 0;
let inFlightRequests = 0;

let activeFlushes = 0;

let flushTimer: NodeJS.Timeout | null = null;

export class IngestionQueueFullError extends Error {
  constructor() {
    super('ingestion queue is full');
    this.name = 'IngestionQueueFullError';
  }
}

export function enqueueLogs(
  logs: LogEntry[]
): Promise<void> {
  if (logs.length === 0) {
    return Promise.resolve();
  }

  const outstandingLogs =
    queuedLogs + inFlightLogs;

  const outstandingRequests =
    pendingRequestCount() +
    inFlightRequests;

  if (
    outstandingLogs + logs.length >
      MAX_OUTSTANDING_LOGS ||
    outstandingRequests + 1 >
      MAX_OUTSTANDING_REQUESTS
  ) {
    return Promise.reject(
      new IngestionQueueFullError()
    );
  }

  return new Promise<void>(
    (resolve, reject) => {
      pendingRequests.push({
        logs,
        enqueuedAt: Date.now(),
        resolve,
        reject
      });

      queuedLogs += logs.length;

      scheduleFlushes();
    }
  );
}

function scheduleFlushes(): void {
  if (pendingRequestCount() === 0) {
    clearFlushTimer();
    return;
  }

  if (
    queuedLogs >= TARGET_DATABASE_BATCH_LOGS
  ) {
    clearFlushTimer();
  }

  while (
    activeFlushes <
      MAX_CONCURRENT_DATABASE_BATCHES &&
    queuedLogs >=
      TARGET_DATABASE_BATCH_LOGS &&
    pendingRequestCount() > 0
  ) {
    void flushOneBatch();
  }

  if (
    pendingRequestCount() === 0 ||
    activeFlushes >=
      MAX_CONCURRENT_DATABASE_BATCHES
  ) {
    return;
  }

  if (flushTimer !== null) {
    return;
  }

  const oldest =
    pendingRequests[queueHead];

  if (oldest === undefined) {
    return;
  }

  const age =
    Date.now() -
    oldest.enqueuedAt;

  const remainingDelay =
    Math.max(
      0,
      MAX_BATCH_DELAY_MS - age
    );

  flushTimer = setTimeout(
    () => {
      flushTimer = null;

      if (
        activeFlushes <
          MAX_CONCURRENT_DATABASE_BATCHES &&
        pendingRequestCount() > 0
      ) {
        void flushOneBatch();
      }
    },
    remainingDelay
  );
}

async function flushOneBatch(): Promise<void> {
  if (
    activeFlushes >=
      MAX_CONCURRENT_DATABASE_BATCHES ||
    pendingRequestCount() === 0
  ) {
    return;
  }

  const requests =
    takeNextDatabaseBatch();

  if (requests.length === 0) {
    return;
  }

  const totalLogs =
    requests.reduce(
      (sum, request) =>
        sum + request.logs.length,
      0
    );

  activeFlushes += 1;

  inFlightLogs += totalLogs;
  inFlightRequests +=
    requests.length;

  const logs =
    combineLogs(
      requests,
      totalLogs
    );

  try {
    await insertLogs(logs);

    for (const request of requests) {
      request.resolve();
    }
  } catch (error) {
    for (const request of requests) {
      request.reject(error);
    }
  } finally {
    activeFlushes -= 1;

    inFlightLogs -= totalLogs;
    inFlightRequests -=
      requests.length;

    compactQueue();

    scheduleFlushes();
  }
}

function takeNextDatabaseBatch():
PendingIngestion[] {
  const selected:
    PendingIngestion[] = [];

  let selectedLogs = 0;

  while (
    queueHead <
    pendingRequests.length
  ) {
    const request =
      pendingRequests[queueHead];

    if (request === undefined) {
      break;
    }

    const wouldExceedTarget =
      selected.length > 0 &&
      selectedLogs +
        request.logs.length >
        TARGET_DATABASE_BATCH_LOGS;

    if (wouldExceedTarget) {
      break;
    }

    queueHead += 1;

    queuedLogs -=
      request.logs.length;

    selected.push(request);

    selectedLogs +=
      request.logs.length;

    if (
      selectedLogs >=
      TARGET_DATABASE_BATCH_LOGS
    ) {
      break;
    }
  }

  return selected;
}

function combineLogs(
  requests: PendingIngestion[],
  totalLogs: number
): LogEntry[] {
  const combined =
    new Array<LogEntry>(
      totalLogs
    );

  let index = 0;

  for (const request of requests) {
    for (const log of request.logs) {
      combined[index] = log;
      index += 1;
    }
  }

  return combined;
}

function pendingRequestCount(): number {
  return (
    pendingRequests.length -
    queueHead
  );
}

function clearFlushTimer(): void {
  if (flushTimer === null) {
    return;
  }

  clearTimeout(flushTimer);
  flushTimer = null;
}

function compactQueue(): void {
  if (queueHead === 0) {
    return;
  }

  if (
    queueHead < 1_024 &&
    queueHead <
      pendingRequests.length / 2
  ) {
    return;
  }

  pendingRequests =
    pendingRequests.slice(
      queueHead
    );

  queueHead = 0;
}