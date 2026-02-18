import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter'
import { MetricExporter } from '@google-cloud/opentelemetry-cloud-monitoring-exporter'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { PrismaInstrumentation } from '@prisma/instrumentation'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { createLogger } from '@/lib/logger'
import { appTitle } from '@/lib/config'

const logger = createLogger('otel')

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

  const spanProcessor =
    isCloudRun || process.env.NODE_ENV === 'production'
      ? new BatchSpanProcessor(traceExporter)
      : new SimpleSpanProcessor(traceExporter)

  const sdk = new NodeSDK({
    serviceName,
    spanProcessors: [spanProcessor],
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 60_000,
    }),
    // Selective instrumentations only — avoids loading unused packages (AWS,
    // Cassandra, gRPC, Kafka, MongoDB, etc.) that increase cold start time.
    instrumentations: [
      new HttpInstrumentation(),
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
    await sdk.shutdown()
    logger.info('Telemetry flushed, exiting.')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}
