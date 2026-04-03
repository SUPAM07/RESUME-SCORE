/**
 * @module @resume-lm/shared/observability/tracing
 *
 * OpenTelemetry tracing initialisation for Node.js / TypeScript microservices.
 *
 * Call `initTracing({ serviceName })` **before** importing any other modules
 * (ideally at the very top of the service entry point) so that
 * auto-instrumentation patches can wrap the HTTP, Express, and database clients
 * before they are used.
 *
 * Usage:
 * ```ts
 * // server.ts  — must be the first import
 * import { initTracing } from '@resume-lm/shared/observability/tracing';
 * initTracing({ serviceName: 'resume-service' });
 *
 * import express from 'express';
 * // ... rest of the application
 * ```
 *
 * The tracer reads its configuration from the following environment variables:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  – OTLP endpoint (default: http://jaeger:4318)
 *   OTEL_TRACES_SAMPLER          – Sampler type   (default: parentbased_always_on)
 *   ENABLE_TRACING               – Set to "false" to disable entirely
 */

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Auto-instrumentation packages
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

export interface TracingOptions {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP collector endpoint. Defaults to OTEL_EXPORTER_OTLP_ENDPOINT env var or http://jaeger:4318 */
  otlpEndpoint?: string;
}

let _sdk: NodeSDK | undefined;

/**
 * Initialise the OpenTelemetry SDK with OTLP export to Jaeger (or any
 * compatible collector).  Safe to call multiple times — subsequent calls are
 * no-ops.
 */
export function initTracing(opts: TracingOptions): void {
  if (process.env['ENABLE_TRACING'] === 'false') {
    return;
  }

  if (_sdk) return; // Already initialised

  const endpoint =
    opts.otlpEndpoint ??
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ??
    'http://jaeger:4318';

  const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });

  _sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: opts.serviceName,
      [ATTR_SERVICE_VERSION]: opts.serviceVersion ?? '1.0.0',
    }),
    traceExporter: exporter,
    instrumentations: [
      new HttpInstrumentation({
        // Suppress health-check spans to reduce noise
        ignoreIncomingRequestHook: (req) =>
          req.url === '/health' || req.url === '/metrics',
      }),
      new ExpressInstrumentation(),
    ],
  });

  _sdk.start();

  process.on('SIGTERM', () => {
    _sdk
      ?.shutdown()
      .catch((err) => console.error('Error shutting down tracing SDK', err));
  });
}

/**
 * Gracefully shut down the tracing SDK.  Called automatically on SIGTERM but
 * exposed here for tests that need deterministic cleanup.
 */
export async function shutdownTracing(): Promise<void> {
  await _sdk?.shutdown();
  _sdk = undefined;
}
