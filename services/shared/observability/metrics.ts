/**
 * @module @resume-lm/shared/observability/metrics
 *
 * Lightweight Prometheus metrics helpers for Node.js / Express microservices.
 *
 * Usage:
 * ```ts
 * import { createMetricsMiddleware, metricsHandler } from
 *   '@resume-lm/shared/observability/metrics';
 *
 * // In app setup:
 * app.use(createMetricsMiddleware('resume-service'));
 * app.get('/metrics', metricsHandler);
 * ```
 *
 * Exposes the following metrics on `GET /metrics`:
 *   http_requests_total{service, method, route, status_code}  – counter
 *   http_request_duration_seconds{service, method, route}     – histogram
 *   nodejs_process_info{service, version, node_version}       – gauge (1)
 */

import type { NextFunction, Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Minimal Prometheus text-format helpers (no external dependency required)
// ---------------------------------------------------------------------------

interface Counter {
  labels: Record<string, string>;
  value: number;
}

interface HistogramBucket {
  le: number | '+Inf';
  count: number;
}

interface HistogramSample {
  labels: Record<string, string>;
  sum: number;
  count: number;
  buckets: HistogramBucket[];
}

const requestCounters: Counter[] = [];
const requestHistograms: HistogramSample[] = [];

const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function labelKey(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}

function incrementCounter(labels: Record<string, string>): void {
  const key = labelKey(labels);
  const existing = requestCounters.find((c) => labelKey(c.labels) === key);
  if (existing) {
    existing.value += 1;
  } else {
    requestCounters.push({ labels, value: 1 });
  }
}

function observeHistogram(labels: Record<string, string>, value: number): void {
  const key = labelKey(labels);
  let sample = requestHistograms.find((h) => labelKey(h.labels) === key);
  if (!sample) {
    sample = {
      labels,
      sum: 0,
      count: 0,
      buckets: (DURATION_BUCKETS.map((le) => ({ le, count: 0 })) as HistogramBucket[]).concat([
        { le: '+Inf', count: 0 },
      ]),
    };
    requestHistograms.push(sample);
  }
  sample.sum += value;
  sample.count += 1;
  for (const bucket of sample.buckets) {
    if (bucket.le === '+Inf' || value <= bucket.le) {
      bucket.count += 1;
    }
  }
}

function formatLabels(labels: Record<string, string>): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
}

function renderMetrics(serviceName: string): string {
  const lines: string[] = [];

  // ── http_requests_total ────────────────────────────────────────────────────
  lines.push('# HELP http_requests_total Total HTTP requests processed');
  lines.push('# TYPE http_requests_total counter');
  for (const c of requestCounters) {
    lines.push(`http_requests_total${formatLabels(c.labels)} ${c.value}`);
  }

  // ── http_request_duration_seconds ─────────────────────────────────────────
  lines.push('# HELP http_request_duration_seconds HTTP request latency in seconds');
  lines.push('# TYPE http_request_duration_seconds histogram');
  for (const h of requestHistograms) {
    const baseLabels = formatLabels(h.labels);
    for (const bucket of h.buckets) {
      const le = bucket.le === '+Inf' ? '+Inf' : String(bucket.le);
      const labelStr = baseLabels
        ? baseLabels.slice(0, -1) + `,le="${le}"}`
        : `{le="${le}"}`;
      lines.push(`http_request_duration_seconds_bucket${labelStr} ${bucket.count}`);
    }
    lines.push(`http_request_duration_seconds_sum${baseLabels} ${h.sum}`);
    lines.push(`http_request_duration_seconds_count${baseLabels} ${h.count}`);
  }

  // ── nodejs_process_info ────────────────────────────────────────────────────
  lines.push('# HELP nodejs_process_info Node.js process information');
  lines.push('# TYPE nodejs_process_info gauge');
  lines.push(
    `nodejs_process_info{service="${serviceName}",` +
      `node_version="${process.version}"} 1`,
  );

  // ── process_uptime_seconds ────────────────────────────────────────────────
  lines.push('# HELP process_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds{service="${serviceName}"} ${process.uptime()}`);

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Middleware + handler
// ---------------------------------------------------------------------------

/**
 * Express middleware that records HTTP request metrics.
 * Mount this before your routes.
 */
export function createMetricsMiddleware(
  serviceName: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationNs = process.hrtime.bigint() - start;
      const durationS = Number(durationNs) / 1e9;

      // Normalise route: replace UUIDs and numeric IDs with placeholders
      const route = req.route?.path ?? req.path.replace(/\/[0-9a-f-]{8,}/gi, '/:id');

      const labels: Record<string, string> = {
        service: serviceName,
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };

      incrementCounter(labels);
      observeHistogram(
        { service: serviceName, method: req.method, route },
        durationS,
      );
    });

    next();
  };
}

/**
 * Express route handler that serves the Prometheus text format on `GET /metrics`.
 */
export function metricsHandler(
  _req: Request,
  res: Response,
  _next: NextFunction,
  serviceName: string,
): void {
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.end(renderMetrics(serviceName));
}
