import { diag, DiagLogLevel, type DiagLogger } from '@opentelemetry/api'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter'
import { MetricExporter } from '@google-cloud/opentelemetry-cloud-monitoring-exporter'
import { gcpDetector } from '@opentelemetry/resource-detector-gcp'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { PrismaInstrumentation } from '@prisma/instrumentation'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { createLogger } from '@/lib/logger'
import { appTitle } from '@/lib/config'

const logger = createLogger('otel')

// Route OTel SDK internal diagnostics through pino so they appear in
// Cloud Logging / local console with the same format as app logs.
// Without this, export failures are silently swallowed by the no-op DiagAPI.
const otelDiagLogger: DiagLogger = {
  verbose: (msg, ...args) => logger.trace({ args: args.length ? args : undefined }, msg),
  debug: (msg, ...args) => logger.debug({ args: args.length ? args : undefined }, msg),
  info: (msg, ...args) => logger.info({ args: args.length ? args : undefined }, msg),
  warn: (msg, ...args) => logger.warn({ args: args.length ? args : undefined }, msg),
  error: (msg, ...args) => logger.error({ args: args.length ? args : undefined }, msg),
}
diag.setLogger(otelDiagLogger, DiagLogLevel.WARN)

// K_SERVICE is set automatically by the Cloud Run runtime.
const isCloudRun = !!process.env.K_SERVICE

if (!isCloudRun && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  logger.info('OpenTelemetry disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)')
} else {
  const serviceName = appTitle

  // On Cloud Run, use Google Cloud exporters which authenticate via ADC
  // (Application Default Credentials) automatically using the attached SA.
  // Locally, use OTLP proto exporters pointed at the docker-compose otel stack.
  const traceExporter = isCloudRun ? new TraceExporter() : new OTLPTraceExporter({})
  const metricExporter = isCloudRun ? new MetricExporter() : new OTLPMetricExporter({})

  const spanProcessor = new BatchSpanProcessor(traceExporter, {
    // Keep well under Cloud Run's 10 s SIGTERM→SIGKILL grace period so the
    // forceFlush inside sdk.shutdown() completes before the process is killed.
    // The default is 30 s, which would always be killed mid-flush.
    exportTimeoutMillis: 8_000,
  })

  const sdk = new NodeSDK({
    serviceName,
    // On Cloud Run, detect the GCP monitored resource (cloud_run_revision) so
    // Cloud Trace Explorer can surface the service name, revision, and region
    // in its Service filter rather than falling back to a generic resource type.
    resourceDetectors: isCloudRun ? [gcpDetector] : [],
    spanProcessors: [spanProcessor],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 60_000,
      }),
    ],
    // Selective instrumentations only — avoids loading unused packages (AWS,
    // Cassandra, gRPC, Kafka, MongoDB, etc.) that increase cold start time.
    instrumentations: [
      new HttpInstrumentation({
        // In dev/Turbopack, the Node.js performance timer and wall clock can
        // disagree, producing startTime > endTime warnings on every request.
        // Suppress incoming-request spans only in dev; production needs them
        // so that Prisma/outgoing spans have a parent and appear correctly in
        // Cloud Trace Explorer instead of as orphaned single-span traces.
        // See: https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1209
        ignoreIncomingRequestHook: () => process.env.NODE_ENV !== 'production',
      }),
      new UndiciInstrumentation(),
      new PrismaInstrumentation(),
    ],
  })
  sdk.start()

  if (isCloudRun) {
    logger.info(
      `OpenTelemetry SDK started (service: ${serviceName}, exporter: Google Cloud Trace/Monitoring)`
    )
  } else {
    logger.info(
      `OpenTelemetry SDK started (service: ${serviceName}, endpoint: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT})`
    )
  }

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, flushing telemetry...`)
    // Race against a hard deadline so we always exit before Cloud Run sends
    // SIGKILL (default grace period is 10 s). The BatchSpanProcessor
    // exportTimeoutMillis is set to 8 s, so a normal flush should win.
    let flushed = false
    await Promise.race([
      sdk.shutdown().then(() => {
        flushed = true
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 9_000)),
    ])
    if (!flushed) logger.error('Telemetry flush timed out; some spans may be lost.')
    logger.info('Telemetry flushed, exiting.')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}
