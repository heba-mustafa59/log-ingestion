import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const insertLogsMock = vi.fn();

vi.mock(
  '../src/logs/repository.js',
  () => ({
    insertLogs: insertLogsMock
  })
);

const {
  enqueueLogs
} = await import(
  '../src/logs/ingestion-batcher.js'
);

import type {
  LogEntry
} from '../src/logs/schema.js';

function makeLogs(
  count: number,
  start: number
): LogEntry[] {
  return Array.from(
    { length: count },
    (_, index) => ({
      timestamp:
        '2026-08-14T07:00:00.000Z',
      level: 'info',
      service: 'batcher-test',
      message:
        `message ${start + index}`,
      attributes: {
        index: start + index
      }
    })
  );
}

describe(
  'ingestion batcher',
  () => {
    beforeEach(() => {
      insertLogsMock.mockReset();
    });

    it(
      'combines multiple requests into one durable database write',
      async () => {
        let completeWrite:
          (() => void) | undefined;

        insertLogsMock.mockImplementation(
          () =>
            new Promise<void>(
              (resolve) => {
                completeWrite = resolve;
              }
            )
        );

        let resolvedRequests = 0;

        const requests:
          Promise<void>[] = [];

        for (
          let requestIndex = 0;
          requestIndex < 20;
          requestIndex += 1
        ) {
          const promise = enqueueLogs(
            makeLogs(
              50,
              requestIndex * 50
            )
          );

          void promise.then(() => {
            resolvedRequests += 1;
          });

          requests.push(promise);
        }

        await vi.waitFor(() => {
          expect(
            insertLogsMock
          ).toHaveBeenCalledTimes(1);
        });

        expect(
          insertLogsMock.mock.calls[0][0]
        ).toHaveLength(1000);

        expect(
          resolvedRequests
        ).toBe(0);

        expect(
          completeWrite
        ).toBeDefined();

        completeWrite?.();

        await Promise.all(requests);

        expect(
          resolvedRequests
        ).toBe(20);
      }
    );
  }
);