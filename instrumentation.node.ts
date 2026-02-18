import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { PrismaInstrumentation } from '@prisma/instrumentation'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { createLogger } from '@/lib/logger'
import { appTitle } from '@/lib/config'

const logger = createLogger('otel')

// Only start OTel when an endpoint is configured to avoid connection errors in
// local dev environments that don't run the otel-collector stack.
if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  logger.info('OpenTelemetry disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)')
} else {
  const serviceName = appTitle

  const traceExporter = new OTLPTraceExporter({})
  const spanProcessors = []
  if (process.env.NODE_ENV === 'production') {
    spanProcessors.push(new BatchSpanProcessor(traceExporter))
  } else {
    spanProcessors.push(new SimpleSpanProcessor(traceExporter))
  }

  const sdk = new NodeSDK({
    serviceName,
    spanProcessors,
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({}),
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
  logger.info(
    `OpenTelemetry SDK started (service: ${serviceName}, endpoint: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT})`
  )

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, flushing telemetry...`)
    await sdk.shutdown()
    logger.info('Telemetry flushed, exiting.')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}
