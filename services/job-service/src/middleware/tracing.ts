/**
 * @module middleware/tracing
 * OpenTelemetry initialisation for job-service.
 *
 * Import this module (with a side-effect import) at the very top of
 * `server.ts` before any other module:
 *
 *   import './middleware/tracing.js';
 */

if (process.env['ENABLE_TRACING'] !== 'false') {
  try {
    // Dynamic require so the package is optional at runtime
    const { initTracing } = await import(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error — dynamic path resolution for optional peer dep
      '@resume-lm/shared/observability/tracing'
    );
    initTracing({ serviceName: 'job-service', serviceVersion: '1.0.0' });
  } catch {
    // OpenTelemetry packages are optional; silently degrade
  }
}
