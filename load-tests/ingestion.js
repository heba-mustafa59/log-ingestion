import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE_URL =
  __ENV.BASE_URL ?? 'http://localhost:8080';

const BATCH_SIZE =
  Number(__ENV.BATCH_SIZE ?? 500);

const RATE =
  Number(__ENV.RATE ?? 30);

const DURATION =
  __ENV.DURATION ?? '30s';

const acceptedLogs = new Counter('accepted_logs');
const rejectedLogs = new Counter('rejected_logs');
const ingestionErrors = new Rate('ingestion_errors');

const timestamp = new Date().toISOString();

const logs = Array.from(
  { length: BATCH_SIZE },
  (_, index) => ({
    timestamp,
    level: 'info',
    service: 'load-test',
    message: `load test message ${index}`,
    attributes: {
      source: 'k6',
      position: index
    }
  })
);

const payload = JSON.stringify({ logs });

export const options = {
  scenarios: {
    ingestion: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 500,
      maxVUs: 1000
    }
  },

  thresholds: {
    http_req_failed: ['rate==0'],
    ingestion_errors: ['rate==0']
  }
};

export default function () {
  const response = http.post(
    `${BASE_URL}/logs`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  const ok = check(response, {
    'POST /logs returns 200':
      (res) => res.status === 200
  });

  ingestionErrors.add(!ok);

  if (!ok) {
    return;
  }

  const body = response.json();

  acceptedLogs.add(body.accepted ?? 0);
  rejectedLogs.add(
    body.rejected?.length ?? 0
  );
}
