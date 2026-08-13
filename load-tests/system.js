import http from 'k6/http';
import { check } from 'k6';
import {
  Counter,
  Rate,
  Trend
} from 'k6/metrics';

const BASE_URL =
  __ENV.BASE_URL ?? 'http://localhost:8080';

const BATCH_SIZE =
  Number(__ENV.BATCH_SIZE ?? 1500);

const INGESTION_RATE =
  Number(__ENV.INGESTION_RATE ?? 12);

const DURATION =
  __ENV.DURATION ?? '5m';

const acceptedLogs =
  new Counter('accepted_logs');

const ingestionErrors =
  new Rate('ingestion_errors');

const queryErrors =
  new Rate('query_errors');

const aggregationErrors =
  new Rate('aggregation_errors');

const queryDuration =
  new Trend('query_duration', true);

const aggregationDuration =
  new Trend('aggregation_duration', true);

export const options = {
  scenarios: {
    ingestion: {
      executor: 'constant-arrival-rate',
      exec: 'ingest',
      rate: INGESTION_RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 100,
      maxVUs: 300
    },

    querying: {
      executor: 'constant-arrival-rate',
      exec: 'queryLogs',
      rate: 2,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 5,
      maxVUs: 20
    },

  },

  thresholds: {
    ingestion_errors: ['rate==0'],
    query_errors: ['rate==0'],
    aggregation_errors: ['rate==0'],

   
  }
};

function makeBatch() {
  const timestamp =
    new Date().toISOString();

  const logs = [];

  for (
    let i = 0;
    i < BATCH_SIZE;
    i++
  ) {
    logs.push({
      timestamp,
      level: 'info',
      service: 'load-test',
      message: `load test message ${i}`,
      attributes: {
        source: 'k6',
        position: i
      }
    });
  }

  return logs;
}

export function ingest() {
  const response = http.post(
    `${BASE_URL}/logs`,
    JSON.stringify({
      logs: makeBatch()
    }),
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  const ok = check(response, {
    'ingestion returns 200':
      (res) => res.status === 200
  });

  ingestionErrors.add(!ok);

  if (ok) {
    const body = response.json();

    acceptedLogs.add(
      body.accepted ?? 0
    );
  }
}

export function queryLogs() {
  const response = http.get(
    `${BASE_URL}/logs?service=load-test&limit=100`
  );

  queryDuration.add(
    response.timings.duration
  );

  const ok = check(response, {
    'query returns 200':
      (res) => res.status === 200
  });

  queryErrors.add(!ok);
}

export function aggregateLogs() {
  const now = Date.now();

  const since =
    new Date(
      now - 60 * 60 * 1000
    ).toISOString();

  const until =
    new Date(
      now + 60 * 1000
    ).toISOString();

  const url =
    `${BASE_URL}/logs/aggregate` +
    `?since=${encodeURIComponent(since)}` +
    `&until=${encodeURIComponent(until)}` +
    '&bucket=1m' +
    '&service=load-test';

  const response = http.get(url);

  aggregationDuration.add(
    response.timings.duration
  );

  const ok = check(response, {
    'aggregation returns 200':
      (res) => res.status === 200
  });

  aggregationErrors.add(!ok);
}
