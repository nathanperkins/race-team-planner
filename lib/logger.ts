import pino from 'pino'

// Use pretty output everywhere except production
const isProduction = process.env.NODE_ENV === 'production'
const isBrowser = typeof window !== 'undefined'
const usePretty = !isProduction && !isBrowser

// Browser-compatible formatter for development
const browserLog = (level: string, module: string | undefined, msg: string, ...args: unknown[]) => {
  const timestamp =
    new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) +
    '.' +
    String(Date.now() % 1000).padStart(3, '0')
  const moduleStr = module ? `[${module}]` : ''
  const levelColors: Record<string, string> = {
    debug: 'color: gray',
    info: 'color: blue',
    warn: 'color: orange',
    error: 'color: red',
  }
  // eslint-disable-next-line no-console -- Browser logging fallback
  console.log(
    `%c[${timestamp}] ${level.toUpperCase()}: ${moduleStr} ${msg}`,
    levelColors[level] || '',
    ...args
  )
}

// Create the base logger
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
  // GCP Cloud Logging compatibility - only in production
  ...(isProduction && {
    messageKey: 'message',
    formatters: {
      level: (label) => {
        return { severity: label.toUpperCase() }
      },
    },
  }),
  // Browser-compatible formatter for client components
  ...(isBrowser &&
    !isProduction && {
      browser: {
        write: (obj: object) => {
          const logObj = obj as Record<string, unknown>
          const level =
            logObj.level === 10
              ? 'debug'
              : logObj.level === 20
                ? 'debug'
                : logObj.level === 30
                  ? 'info'
                  : logObj.level === 40
                    ? 'warn'
                    : logObj.level === 50
                      ? 'error'
                      : 'info'
          browserLog(level, logObj.module as string | undefined, logObj.msg as string)
        },
      },
    }),
  // Node.js pretty formatter
  ...(usePretty && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,module',
        messageFormat: '[{module}] {msg}',
      },
    },
  }),
})

// Utility to create child loggers with context
export function createLogger(context: string | Record<string, unknown>) {
  if (typeof context === 'string') {
    return logger.child({ module: context })
  }
  return logger.child(context)
}

export default logger
