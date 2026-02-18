import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { PrismaInstrumentation } from '@prisma/instrumentation'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'

const traceExporter = new OTLPTraceExporter({})
const spanProcessors = []
if (process.env.NODE_ENV === 'production') {
  spanProcessors.push(new BatchSpanProcessor(traceExporter))
} else {
  spanProcessors.push(new SimpleSpanProcessor(traceExporter))
}

const sdk = new NodeSDK({
  serviceName: 'srg-team-planner',
  spanProcessors: spanProcessors,
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({}),
  }),
  instrumentations: [getNodeAutoInstrumentations(), new PrismaInstrumentation()],
})
sdk.start()
