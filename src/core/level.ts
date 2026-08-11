/**
 * Log levels enum - numeric values for filtering
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * Map log level enum to human-readable names
 */
export const LogLevelName: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'debug',
  [LogLevel.INFO]: 'info',
  [LogLevel.WARN]: 'warn',
  [LogLevel.ERROR]: 'error',
  [LogLevel.SILENT]: 'silent',
}

/**
 * Parse a log level from string or number
 *
 * @param level - Level as string ('debug', 'info', etc.) or number (0-4)
 * @returns Numeric log level
 *
 * @example
 * ```typescript
 * parseLevel('debug') // 0
 * parseLevel('warn')  // 2
 * parseLevel(1)       // 1
 * parseLevel(' WARNING ') // 2
 * parseLevel('invalid') // throws RangeError
 * ```
 */
export function parseLevel(level: string | number): LogLevel {
  if (typeof level === 'number') {
    if (!Number.isInteger(level) || level < LogLevel.DEBUG || level > LogLevel.SILENT) {
      throw new RangeError('Log level number must be an integer between 0 and 4')
    }
    return level as LogLevel
  }

  const normalized = level.trim().toLowerCase()
  switch (normalized) {
    case 'debug':
      return LogLevel.DEBUG
    case 'info':
      return LogLevel.INFO
    case 'warn':
    case 'warning':
      return LogLevel.WARN
    case 'error':
      return LogLevel.ERROR
    case 'silent':
    case 'none':
      return LogLevel.SILENT
    default:
      throw new RangeError(
        'Log level must be debug, info, warn, warning, error, silent, or none',
      )
  }
}

/**
 * Check if a message should be logged based on minimum level
 *
 * @param messageLevel - Level of the message being logged
 * @param minimumLevel - Minimum level configured for the logger
 * @returns True if message should be logged
 *
 * @example
 * ```typescript
 * shouldLog(LogLevel.DEBUG, LogLevel.INFO) // false
 * shouldLog(LogLevel.ERROR, LogLevel.INFO) // true
 * shouldLog(LogLevel.WARN, LogLevel.WARN)  // true
 * ```
 */
export function shouldLog(messageLevel: LogLevel, minimumLevel: LogLevel): boolean {
  return messageLevel >= minimumLevel
}
