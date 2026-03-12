/**
 * @lpm.dev/neo.logger
 *
 * Zero-dependency production logger - Fast, modern alternative to winston and pino
 *
 * @example
 * ```typescript
 * // Use default logger
 * import logger from '@lpm.dev/neo.logger'
 * logger.info('Server started', { port: 3000 })
 *
 * // Create custom logger
 * import { createLogger, FileTransport } from '@lpm.dev/neo.logger'
 *
 * const logger = createLogger({
 *   level: 'debug',
 *   namespace: 'app',
 *   transports: [
 *     new ConsoleTransport(),
 *     new FileTransport({ path: 'app.log', format: 'json' })
 *   ]
 * })
 *
 * logger.debug('Debug info')
 * logger.info('Info message', { userId: 123 })
 * logger.warn('Warning', { code: 'DEPRECATION' })
 * logger.error('Error occurred', new Error('Failed'))
 * ```
 */

// Export core logger class
export { Logger } from './core/logger.js'

// Export transports
export { ConsoleTransport, FileTransport, CustomTransport } from './core/transport.js'

// Export log levels
export { LogLevel, LogLevelName, parseLevel, shouldLog } from './core/level.js'

// Export formatters (for custom use)
export { formatConsole, formatJSON } from './core/formatter.js'

// Export utilities
export { shouldRotate, rotateFiles } from './utils/rotate.js'
export { formatTimestamp, formatHumanTime, getCurrentTimestamp } from './utils/time.js'
export { parseStack, formatStack } from './utils/stack.js'
export type { StackFrame } from './utils/stack.js'

// Export TypeScript types
export type {
  LogEntry,
  LoggerOptions,
  Transport,
  FormatterOptions,
  FileTransportOptions,
  ConsoleTransportOptions,
} from './types.js'

// Re-export for convenience
import { Logger } from './core/logger.js'
import type { LoggerOptions } from './types.js'

/**
 * Create a new logger instance
 *
 * @param options - Logger configuration options
 * @returns New Logger instance
 *
 * @example
 * ```typescript
 * const logger = createLogger({
 *   level: 'debug',
 *   namespace: 'myapp'
 * })
 * ```
 */
export function createLogger(options?: LoggerOptions): Logger {
  return new Logger(options)
}

/**
 * Default logger instance
 *
 * Uses INFO level and console transport by default.
 * Configure via environment variables:
 * - LOG_LEVEL: Set minimum log level (debug, info, warn, error, silent)
 *
 * @example
 * ```typescript
 * import logger from '@lpm.dev/neo.logger'
 *
 * logger.info('Application started')
 * logger.error('Failed to connect', error)
 * ```
 */
const defaultLogger = new Logger({
  level: process.env.LOG_LEVEL || 'info',
})

export default defaultLogger
