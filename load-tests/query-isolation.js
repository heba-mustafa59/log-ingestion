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

const INGESTION_RATE =
  Number(__ENV.INGESTION_RATE ?? 455);

const QUERY_TYPE =
  __ENV.QUERY_TYPE ?? 'pagination';

const DURATION =
  __ENV.DURATION ?? '20s';

const acceptedLogs =
  new Counter('accepted_logs');

const ingestionErrors =
  new Rate('ingestion_errors');

const queryErrors =
  new Rate('query_errors');

const ingestionDuration =
  new Trend(
    'ingestion_duration',
    true
  );

const queryDuration =
  new Trend(
    'query_duration',
    true
  );

export const options = {
  scenarios: {
    ingestion: {
      executor: 'constant-arrival-rate',
      exec: 'ingest',

      rate: INGESTION_RATE,
      timeUnit: '1s',
      duration: DURATION,

      preAllocatedVUs: 500,
      maxVUs: 1000
    },

    querying: {
      executor: 'constant-arrival-rate',
      exec: 'runSelectedQuery',

      rate: 1,
      timeUnit: '1s',
      duration: DURATION,

      preAllocatedVUs: 5,
      maxVUs: 30
    }
  },

  thresholds: {
    ingestion_errors: [
      'rate==0'
    ],

    query_errors: [
      'rate==0'
    ]
  }
};

function makePayload() {
  const timestamp =
    new Date().toISOString();

  const logs = Array.from(
    { length: BATCH_SIZE },
    (_, index) => ({
      timestamp,
      level: 'info',
      service: 'load-test',
      message:
        `load test message ${index}`,
      attributes: {
        region: 'eu',
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

  if (ok) {
    const body = response.json();

    acceptedLogs.add(
      body.accepted ?? 0
    );
  }
}

export function runSelectedQuery() {
  const paths = {
    pagination:
      '/logs?limit=1000',

    service:
      '/logs?service=service-7&limit=1000',

    level:
      '/logs?level=error&limit=1000',

    attribute:
      '/logs?attr.region=eu&limit=1000',

    text:
      '/logs?q=message&limit=1000',

    combined:
      '/logs?service=service-7&level=error&attr.region=eu&q=message&limit=1000'
  };

  const path =
    paths[QUERY_TYPE];

  if (path === undefined) {
    throw new Error(
      `unsupported QUERY_TYPE: ${QUERY_TYPE}`
    );
  }

  const response =
    http.get(
      `${BASE_URL}${path}`
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
