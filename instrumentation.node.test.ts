import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockLogger = {
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

const mockSdkStart = vi.fn()
const mockSdkShutdown = vi.fn().mockResolvedValue(undefined)
const mockNodeSdkCtor = vi.fn()
const mockTraceExporterCtor = vi.fn()
const mockOtlpTraceExporterCtor = vi.fn()
const mockOtlpMetricExporterCtor = vi.fn()
const mockSimpleSpanProcessorCtor = vi.fn()
const mockBatchSpanProcessorCtor = vi.fn()
const mockPeriodicMetricReaderCtor = vi.fn()
const mockDiagSetLogger = vi.fn()

vi.mock('@opentelemetry/api', () => ({
  diag: { setLogger: (...args: unknown[]) => mockDiagSetLogger(...args) },
  DiagLogLevel: { WARN: 50 },
}))

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class {
    constructor(config: unknown) {
      mockNodeSdkCtor(config)
    }
    start = mockSdkStart
    shutdown = mockSdkShutdown
  },
}))

vi.mock('@google-cloud/opentelemetry-cloud-trace-exporter', () => ({
  TraceExporter: class {
    readonly kind = 'gcp-trace-exporter'
    constructor() {
      mockTraceExporterCtor()
    }
  },
}))

vi.mock('@opentelemetry/exporter-trace-otlp-proto', () => ({
  OTLPTraceExporter: class {
    readonly kind = 'otlp-trace-exporter'
    constructor(opts: unknown) {
      mockOtlpTraceExporterCtor(opts)
    }
  },
}))

vi.mock('@opentelemetry/exporter-metrics-otlp-proto', () => ({
  OTLPMetricExporter: class {
    readonly kind = 'otlp-metric-exporter'
    constructor(opts: unknown) {
      mockOtlpMetricExporterCtor(opts)
    }
  },
}))

vi.mock('@opentelemetry/resource-detector-gcp', () => ({
  gcpDetector: { kind: 'gcp-detector' },
}))

vi.mock('@opentelemetry/sdk-metrics', () => ({
  PeriodicExportingMetricReader: class {
    readonly kind = 'periodic-metric-reader'
    constructor(opts: unknown) {
      mockPeriodicMetricReaderCtor(opts)
    }
  },
}))

vi.mock('@opentelemetry/sdk-trace-node', () => ({
  SimpleSpanProcessor: class {
    readonly kind = 'simple-span-processor'
    constructor(exporter: unknown) {
      mockSimpleSpanProcessorCtor(exporter)
    }
  },
  BatchSpanProcessor: class {
    readonly kind = 'batch-span-processor'
    constructor(exporter: unknown, opts: unknown) {
      mockBatchSpanProcessorCtor(exporter, opts)
    }
  },
}))

vi.mock('@opentelemetry/instrumentation-http', () => ({
  HttpInstrumentation: class {},
}))

vi.mock('@opentelemetry/instrumentation-undici', () => ({
  UndiciInstrumentation: class {},
}))

vi.mock('@prisma/instrumentation', () => ({
  PrismaInstrumentation: class {},
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => mockLogger,
}))

vi.mock('@/lib/config', () => ({
  appTitle: 'SRG Team Planner (test)',
}))

describe('instrumentation.node', () => {
  const originalSigtermListeners = process.listeners('SIGTERM')
  const originalSigintListeners = process.listeners('SIGINT')

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('K_SERVICE', '')
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    for (const listener of process.listeners('SIGTERM')) {
      if (!originalSigtermListeners.includes(listener)) {
        process.removeListener('SIGTERM', listener)
      }
    }
    for (const listener of process.listeners('SIGINT')) {
      if (!originalSigintListeners.includes(listener)) {
        process.removeListener('SIGINT', listener)
      }
    }
  })

  it('disables OpenTelemetry when neither K_SERVICE nor OTEL_EXPORTER_OTLP_ENDPOINT is set', async () => {
    await import('./instrumentation.node')

    expect(mockNodeSdkCtor).not.toHaveBeenCalled()
    expect(mockSdkStart).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalledWith(
      'OpenTelemetry disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)'
    )
  })

  it('uses BatchSpanProcessor for traces and disables periodic metrics on Cloud Run (cpu_idle = true)', async () => {
    vi.stubEnv('K_SERVICE', 'iracing-team-planner')

    await import('./instrumentation.node')

    expect(mockTraceExporterCtor).toHaveBeenCalledTimes(1)
    expect(mockBatchSpanProcessorCtor).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'gcp-trace-exporter' }),
      { exportTimeoutMillis: 8_000 }
    )
    expect(mockSimpleSpanProcessorCtor).not.toHaveBeenCalled()
    expect(mockPeriodicMetricReaderCtor).not.toHaveBeenCalled()
    expect(mockOtlpTraceExporterCtor).not.toHaveBeenCalled()
    expect(mockOtlpMetricExporterCtor).not.toHaveBeenCalled()

    expect(mockNodeSdkCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'SRG Team Planner (test)',
        resourceDetectors: [{ kind: 'gcp-detector' }],
        spanProcessors: [expect.objectContaining({ kind: 'batch-span-processor' })],
        metricReaders: [],
      })
    )
    expect(mockSdkStart).toHaveBeenCalledTimes(1)
    expect(mockLogger.info).toHaveBeenCalledWith(
      'OpenTelemetry SDK started (service: SRG Team Planner (test), exporter: Google Cloud Trace)'
    )
  })

  it('uses BatchSpanProcessor and PeriodicExportingMetricReader locally when OTEL_EXPORTER_OTLP_ENDPOINT is set', async () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318')

    await import('./instrumentation.node')

    expect(mockOtlpTraceExporterCtor).toHaveBeenCalledTimes(1)
    expect(mockOtlpMetricExporterCtor).toHaveBeenCalledTimes(1)
    expect(mockBatchSpanProcessorCtor).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'otlp-trace-exporter' }),
      { exportTimeoutMillis: 8_000 }
    )
    expect(mockPeriodicMetricReaderCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        exporter: expect.objectContaining({ kind: 'otlp-metric-exporter' }),
        exportIntervalMillis: 60_000,
      })
    )
    expect(mockSimpleSpanProcessorCtor).not.toHaveBeenCalled()
    expect(mockTraceExporterCtor).not.toHaveBeenCalled()

    expect(mockNodeSdkCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'SRG Team Planner (test)',
        resourceDetectors: [],
        spanProcessors: [expect.objectContaining({ kind: 'batch-span-processor' })],
        metricReaders: [expect.objectContaining({ kind: 'periodic-metric-reader' })],
      })
    )
    expect(mockSdkStart).toHaveBeenCalledTimes(1)
  })
})
