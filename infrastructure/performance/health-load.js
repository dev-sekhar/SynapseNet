import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.SYNAPSENET_PUBLIC_URL || 'http://host.docker.internal:3001';

export const options = {
  scenarios: {
    health_capacity: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.PHASE6_REQUEST_RATE || 20),
      timeUnit: '1s',
      duration: __ENV.PHASE6_DURATION || '2m',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/api/health`, { tags: { operation: 'health' } });
  check(response, {
    'health returned 200': (result) => result.status === 200,
    'health returned JSON': (result) =>
      (result.headers['Content-Type'] || '').includes('application/json'),
  });
  sleep(0.05);
}
