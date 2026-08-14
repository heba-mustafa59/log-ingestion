import http from 'k6/http';
import { check } from 'k6';
import {
  Counter,
  Rate,
  Trend
} from 'k6/metrics';

const BASE_URL =
  __ENV.BASE_URL ??
  'http://localhost:8080';

const BATCH_SIZE =
  Number(__ENV.BATCH_SIZE ?? 33);

const REQUEST_RATE =
  Number(__ENV.REQUEST_RATE ?? 455);

const DURATION =
  __ENV.DURATION ?? '30s';

const acceptedLogs =
  new Counter('accepted_logs');

const ingestionErrors =
  new Rate('ingestion_errors');

const queryErrors =
  new Rate('query_errors');

const aggregationErrors =
  new Rate('aggregation_errors');

const ingestionDuration =
  new Trend('ingestion_duration', true);

const queryDuration =
  new Trend('query_duration', true);

const aggregationDuration =
  new Trend(
    'aggregation_duration',
    true
  );

export const options = {
  scenarios: {
    ingestion: {
      executor:
        'constant-arrival-rate',

      exec: 'ingest',

      rate: REQUEST_RATE,
      timeUnit: '1s',

      duration: DURATION,

      preAllocatedVUs: 500,
      maxVUs: 1000
    },

    querying: {
      executor:
        'constant-arrival-rate',

      exec: 'queryLogs',

      rate: 2,
      timeUnit: '1s',

      duration: DURATION,

      preAllocatedVUs: 10,
      maxVUs: 50
    },

    aggregation: {
      executor:
        'constant-arrival-rate',

      exec: 'aggregateLogs',

      rate: 1,
      timeUnit: '1s',

      duration: DURATION,

      preAllocatedVUs: 5,
      maxVUs: 20
    }
  },

  thresholds: {
    ingestion_errors: [
      'rate==0'
    ],

    query_errors: [
      'rate==0'
    ],

    aggregation_errors: [
      'rate==0'
    ],

    aggregation_duration: [
      'p(95)<1000'
    ],

    dropped_iterations: [
      'count==0'
    ]
  }
};

function makePayload() {
  const timestamp =
    new Date().toISOString();

  const logs =
    Array.from(
      {
        length: BATCH_SIZE
      },
      (_, index) => ({
        timestamp,
        level: 'info',
        service: 'official-like',
        message:
          `official-like log ${index}`,
        attributes: {
          source: 'k6',
          position: index
        }
      })
    );

  return JSON.stringify({
    logs
  });
}

export function ingest() {
  const response = http.post(
    `${BASE_URL}/logs`,
    makePayload(),
    {
      headers: {
        'Content-Type':
          'application/json'
      }
    }
  );

  ingestionDuration.add(
    response.timings.duration
  );

  const ok = check(response, {
    'ingestion returns 200':
      (res) => res.status === 200
  });

  ingestionErrors.add(!ok);

  if (!ok) {
    return;
  }

  const body = response.json();

  acceptedLogs.add(
    body.accepted ?? 0
  );
}

export function queryLogs() {
  const response = http.get(
    `${BASE_URL}/logs` +
    '?service=official-like' +
    '&limit=100'
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
    `?since=${encodeURIComponent(
      since
    )}` +
    `&until=${encodeURIComponent(
      until
    )}` +
    '&bucket=1m' +
    '&service=official-like';

  const response =
    http.get(url);

  aggregationDuration.add(
    response.timings.duration
  );

  const ok = check(response, {
    'aggregation returns 200':
      (res) => res.status === 200
  });

  aggregationErrors.add(!ok);
}