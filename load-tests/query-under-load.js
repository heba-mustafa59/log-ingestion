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

const DURATION =
  __ENV.DURATION ?? '30s';

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

const serviceDuration =
  new Trend(
    'query_service_duration',
    true
  );

const levelDuration =
  new Trend(
    'query_level_duration',
    true
  );

const attributeDuration =
  new Trend(
    'query_attribute_duration',
    true
  );

const textDuration =
  new Trend(
    'query_text_duration',
    true
  );

const combinedDuration =
  new Trend(
    'query_combined_duration',
    true
  );

const paginationDuration =
  new Trend(
    'query_pagination_duration',
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

    serviceQuery: {
      executor: 'constant-arrival-rate',
      exec: 'queryService',

      rate: 1,
      timeUnit: '1s',
      duration: DURATION,

      preAllocatedVUs: 3,
      maxVUs: 20
    },

    levelQuery: {
      executor: 'constant-arrival-rate',
      exec: 'queryLevel',

      rate: 1,
      timeUnit: '1s',
      duration: DURATION,

      preAllocatedVUs: 3,
      maxVUs: 20
    },

    attributeQuery: {
      executor: 'constant-arrival-rate',
      exec: 'queryAttribute',

      rate: 1,
      timeUnit: '1s',
      duration: DURATION,

      preAllocatedVUs: 3,
      maxVUs: 20
    },

    textQuery: {
      executor: 'constant-arrival-rate',
      exec: 'queryText',

      rate: 1,
      timeUnit: '1s',
      duration: DURATION,

      preAllocatedVUs: 3,
      maxVUs: 20
    },

    combinedQuery: {
      executor: 'constant-arrival-rate',
      exec: 'queryCombined',

      rate: 1,
      timeUnit: '1s',
      duration: DURATION,

      preAllocatedVUs: 3,
      maxVUs: 20
    },

    paginationQuery: {
      executor: 'constant-arrival-rate',
      exec: 'queryPagination',

      rate: 1,
      timeUnit: '1s',
      duration: DURATION,

      preAllocatedVUs: 3,
      maxVUs: 20
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

function runQuery(
  path,
  trend
) {
  const response =
    http.get(
      `${BASE_URL}${path}`
    );

  trend.add(
    response.timings.duration
  );

  const ok = check(response, {
    'query returns 200':
      (res) => res.status === 200
  });

  queryErrors.add(!ok);

  return response;
}

export function queryService() {
  runQuery(
    '/logs?service=service-7&limit=1000',
    serviceDuration
  );
}

export function queryLevel() {
  runQuery(
    '/logs?level=error&limit=1000',
    levelDuration
  );
}

export function queryAttribute() {
  runQuery(
    '/logs?attr.region=eu&limit=1000',
    attributeDuration
  );
}

export function queryText() {
  runQuery(
    '/logs?q=message&limit=1000',
    textDuration
  );
}

export function queryCombined() {
  runQuery(
    '/logs?service=service-7&level=error&attr.region=eu&q=message&limit=1000',
    combinedDuration
  );
}

export function queryPagination() {
  const first =
    runQuery(
      '/logs?limit=1000',
      paginationDuration
    );

  if (first.status !== 200) {
    return;
  }

  const body =
    first.json();

  if (
    body.next_cursor === null ||
    body.next_cursor === undefined
  ) {
    return;
  }

  runQuery(
    `/logs?limit=1000&cursor=${encodeURIComponent(
      body.next_cursor
    )}`,
    paginationDuration
  );
}
