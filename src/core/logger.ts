import type { LogEntry, LoggerOptions, Transport } from '../types.js'
import { LogLevel, LogLevelName, parseLevel, shouldLog } from './level.js'
import { ConsoleTransport } from './transport.js'

/**
 * Logger class - Main API for logging messages
 *
 * @example
 * ```typescript
 * const logger = new Logger({
 *   level: 'debug',
 *   namespace: 'app',
 *   transports: [new ConsoleTransport()]
 * })
 *
 * logger.info('Server started', { port: 3000 })
 * logger.error('Failed to connect', new Error('Connection refused'))
 * ```
 */
export class Logger {
  private level: LogLevel
  private namespace?: string
  private transports: Transport[]

  constructor(options: LoggerOptions = {}) {
    this.level = parseLevel(options.level ?? 'info')
    if (options.namespace !== undefined) {
      this.namespace = options.namespace
    }
    this.transports = options.transports ?? [new ConsoleTransport()]
  }

  /**
   * Log a debug message
   *
   * @param message - Debug message
   * @param data - Additional structured data
   *
   * @example
   * ```typescript
   * logger.debug('Cache hit', { key: 'user:123', ttl: 3600 })
   * ```
   */
  debug(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, data)
  }

  /**
   * Log an info message
   *
   * @param message - Info message
   * @param data - Additional structured data
   *
   * @example
   * ```typescript
   * logger.info('User logged in', { userId: 123, ip: '192.168.1.1' })
   * ```
   */
  info(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, data)
  }

  /**
   * Log a warning message
   *
   * @param message - Warning message
   * @param data - Additional structured data
   *
   * @example
   * ```typescript
   * logger.warn('API rate limit approaching', { used: 950, limit: 1000 })
   * ```
   */
  warn(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, data)
  }

  /**
   * Log an error message
   *
   * @param message - Error message
   * @param error - Error object (optional)
   * @param data - Additional structured data
   *
   * @example
   * ```typescript
   * logger.error('Database connection failed', error, { host: 'localhost' })
   * ```
   */
  error(message: string, error?: Error, data?: Record<string, any>): void {
    // Handle overload: error(message, data?)
    let actualError: Error | undefined
    let actualData: Record<string, any> | undefined

    if (error && !(error instanceof Error)) {
      // Second argument is data, not error
      actualData = error as unknown as Record<string, any>
      actualError = undefined
    } else {
      actualError = error
      actualData = data
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level: LogLevelName[LogLevel.ERROR]!,
      message,
      ...(this.namespace !== undefined && { namespace: this.namespace }),
      ...(actualError !== undefined && { error: actualError }),
      ...(actualData !== undefined && { data: actualData }),
    }

    if (shouldLog(LogLevel.ERROR, this.level)) {
      this.write(entry)
    }
  }

  /**
   * Core log method - handles level filtering and entry creation
   *
   * @param level - Log level
   * @param message - Log message
   * @param data - Additional structured data
   * @private
   */
  private log(level: LogLevel, message: string, data?: Record<string, any>): void {
    if (!shouldLog(level, this.level)) {
      return
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level: LogLevelName[level]!,
      message,
      ...(this.namespace !== undefined && { namespace: this.namespace }),
      ...(data !== undefined && { data }),
    }

    this.write(entry)
  }

  /**
   * Write log entry to all transports
   *
   * @param entry - Log entry to write
   * @private
   */
  private write(entry: LogEntry): void {
    for (const transport of this.transports) {
      // Fire and forget (non-blocking)
      transport.write(entry).catch((err) => {
        // Avoid infinite loop - write directly to stderr
        process.stderr.write(`[neo.logger] Transport write failed: ${err.message}\n`)
      })
    }
  }

  /**
   * Create a child logger with a nested namespace
   *
   * Child loggers inherit the parent's level and transports.
   *
   * @param namespace - Child namespace
   * @returns New logger instance with nested namespace
   *
   * @example
   * ```typescript
   * const logger = new Logger({ namespace: 'app' })
   * const dbLogger = logger.child('database')
   * dbLogger.info('Connected') // [app:database] Connected
   *
   * const redisLogger = dbLogger.child('redis')
   * redisLogger.debug('Cache hit') // [app:database:redis] Cache hit
   * ```
   */
  child(namespace: string): Logger {
    const childNamespace = this.namespace ? `${this.namespace}:${namespace}` : namespace

    return new Logger({
      level: this.level,
      namespace: childNamespace,
      transports: this.transports,
    })
  }

  /**
   * Set minimum log level
   *
   * @param level - New minimum level ('debug', 'info', 'warn', 'error', 'silent')
   *
   * @example
   * ```typescript
   * logger.setLevel('debug') // Show all messages
   * logger.setLevel('error') // Only show errors
   * logger.setLevel('silent') // Suppress all output
   * ```
   */
  setLevel(level: string | LogLevel): void {
    this.level = parseLevel(level)
  }

  /**
   * Get current log level
   *
   * @returns Current minimum log level
   *
   * @example
   * ```typescript
   * const level = logger.getLevel()
   * console.log(LogLevelName[level]) // 'info'
   * ```
   */
  getLevel(): LogLevel {
    return this.level
  }
}
