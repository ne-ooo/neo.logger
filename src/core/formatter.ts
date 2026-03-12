import type { LogEntry, FormatterOptions } from '../types.js'

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
}

/**
 * Format log entry for console output (pretty, colored)
 *
 * @param entry - Log entry to format
 * @param options - Formatting options
 * @returns Formatted string for console output
 *
 * @example
 * ```typescript
 * const entry = {
 *   timestamp: Date.now(),
 *   level: 'info',
 *   message: 'Server started',
 *   data: { port: 3000 }
 * }
 * console.log(formatConsole(entry))
 * // 2024-01-15T10:30:45.123Z INFO  Server started { port: 3000 }
 * ```
 */
export function formatConsole(entry: LogEntry, options: FormatterOptions = {}): string {
  const { colors = true, timestamp = true } = options

  let output = ''

  // Timestamp
  if (timestamp) {
    const time = new Date(entry.timestamp).toISOString()
    output += colors ? `${COLORS.gray}${time}${COLORS.reset} ` : `${time} `
  }

  // Level with color
  const levelStr = entry.level.toUpperCase().padEnd(5)
  if (colors) {
    const color = getLevelColor(entry.level)
    output += `${color}${levelStr}${COLORS.reset} `
  } else {
    output += `${levelStr} `
  }

  // Namespace (if provided)
  if (entry.namespace) {
    output += colors ? `${COLORS.cyan}[${entry.namespace}]${COLORS.reset} ` : `[${entry.namespace}] `
  }

  // Message
  output += entry.message

  // Extra fields
  if (entry.data && Object.keys(entry.data).length > 0) {
    const dataStr = JSON.stringify(entry.data)
    output += colors ? ` ${COLORS.gray}${dataStr}${COLORS.reset}` : ` ${dataStr}`
  }

  // Error stack
  if (entry.error) {
    output += `\n${entry.error.stack || entry.error.message}`
  }

  return output
}

/**
 * Format log entry as JSON (structured logging)
 *
 * @param entry - Log entry to format
 * @returns JSON string representing the log entry
 *
 * @example
 * ```typescript
 * const entry = {
 *   timestamp: Date.now(),
 *   level: 'error',
 *   message: 'Failed to connect',
 *   error: new Error('Connection refused')
 * }
 * console.log(formatJSON(entry))
 * // {"timestamp":1705318245123,"level":"error","message":"Failed to connect","error":{"message":"Connection refused",...}}
 * ```
 */
export function formatJSON(entry: LogEntry): string {
  const record: Record<string, any> = {
    timestamp: entry.timestamp,
    level: entry.level,
    message: entry.message,
  }

  if (entry.namespace) {
    record.namespace = entry.namespace
  }

  if (entry.data) {
    record.data = entry.data
  }

  if (entry.error) {
    record.error = {
      message: entry.error.message,
      stack: entry.error.stack,
      name: entry.error.name,
    }
  }

  return JSON.stringify(record)
}

/**
 * Get ANSI color code for log level
 *
 * @param level - Log level name
 * @returns ANSI color code
 * @internal
 */
function getLevelColor(level: string): string {
  switch (level) {
    case 'debug':
      return COLORS.blue
    case 'info':
      return COLORS.cyan
    case 'warn':
      return COLORS.yellow
    case 'error':
      return COLORS.red
    default:
      return COLORS.reset
  }
}
