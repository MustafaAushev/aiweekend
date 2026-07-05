// eval для agents/performance.md — нагрузочный p99-gate (запуск: k6 run evals/hot_path_load.js)
// Пороги — примеры под калибровку SLO (см. harness/thresholds.yaml). CI падает (exit 99) при нарушении.
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    hot_path: {
      executor: 'constant-arrival-rate',   // open-loop: честная p99 (против coordinated omission)
      rate: 500, timeUnit: '1s', duration: '2m',
      preAllocatedVUs: 100, maxVUs: 500,
    },
  },
  thresholds: {
    'http_req_duration{path:hot}': ['p(99)<300', 'p(95)<150'], // мс — тюнить под SLO
    'http_req_failed': ['rate<0.001'],
  },
};

export default function () {
  const res = http.get('http://localhost:3000/api/hot', { tags: { path: 'hot' } });
  check(res, { 'status 200': (r) => r.status === 200 });
}

// Тренд-проверка асимптотики (ловит O(N²) по факту, не по AST):
//   прогнать на датасете ×1/×10/×100, снять p99 на каждом →
//   показатель степени роста ≤ thresholds.yaml performance.asymptote_slope_max (1=линейно OK, 2=квадратично FAIL).
