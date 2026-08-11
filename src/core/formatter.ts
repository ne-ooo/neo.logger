import type { ErrorLike, LogEntry, FormatterOptions } from '../types.js'
import {
  escapeLogText,
  escapeUnsafeJsonCharacters,
  formatLogLines,
} from '../utils/sanitize.js'
import { isErrorLike } from '../utils/error.js'

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

function describeSerializationError(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error)
  } catch {
    return 'Unknown serialization error'
  }
}

function serializeError(error: ErrorLike): Record<string, unknown> {
  const record = Object.create(null) as Record<string, unknown>

  try {
    record.name = error.name ?? 'Error'
  } catch {
    record.name = 'Error'
  }
  try {
    record.message = error.message
  } catch {
    record.message = 'Unable to read error message'
  }
  try {
    if (error.stack !== undefined) {
      record.stack = error.stack
    }
  } catch {
    record.stack = 'Unable to read error stack'
  }
  try {
    if ('cause' in error) {
      record.cause = error.cause
    }
  } catch {
    record.cause = 'Unable to read error cause'
  }

  try {
    for (const key of Object.keys(error)) {
      if (!Object.hasOwn(record, key)) {
        try {
          record[key] = (error as unknown as Record<string, unknown>)[key]
        } catch {
          record[key] = 'Unable to read error property'
        }
      }
    }
  } catch {
    // Error metadata is best-effort.
  }

  return record
}

function createSafeReplacer(): (this: unknown, key: string, value: unknown) => unknown {
  const ancestors: object[] = []
  const serializedErrors = new WeakSet<object>()

  return function safeReplacer(this: unknown, _key: string, value: unknown): unknown {
    if (typeof value === 'bigint') {
      return value.toString()
    }

    if (isErrorLike(value)) {
      if (serializedErrors.has(value)) {
        return '[Circular Error]'
      }
      serializedErrors.add(value)
      return serializeError(value)
    }

    if (typeof value !== 'object' || value === null) {
      return value
    }

    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop()
    }
    if (ancestors.includes(value)) {
      return '[Circular]'
    }
    ancestors.push(value)
    return value
  }
}

function stringifySafely(value: unknown): string {
  const result = JSON.stringify(value, createSafeReplacer())
  return escapeUnsafeJsonCharacters(result ?? 'null')
}

function formatErrorForConsole(error: ErrorLike): string {
  try {
    return formatLogLines(error.stack || error.message || error.name || 'Error')
  } catch (serializationError) {
    return escapeLogText(
      `[Unserializable error: ${describeSerializationError(serializationError)}]`,
    )
  }
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
  const levelStr = escapeLogText(entry.level.toUpperCase()).padEnd(5)
  if (colors) {
    const color = getLevelColor(entry.level)
    output += `${color}${levelStr}${COLORS.reset} `
  } else {
    output += `${levelStr} `
  }

  // Namespace (if provided)
  if (entry.namespace) {
    const namespace = escapeLogText(entry.namespace)
    output += colors ? `${COLORS.cyan}[${namespace}]${COLORS.reset} ` : `[${namespace}] `
  }

  // Message
  output += escapeLogText(entry.message)

  // Extra fields
  if (entry.data) {
    let dataStr: string
    try {
      dataStr = stringifySafely(entry.data)
    } catch (error) {
      dataStr = stringifySafely(`[Unserializable data: ${describeSerializationError(error)}]`)
    }
    if (dataStr !== '{}') {
      output += colors ? ` ${COLORS.gray}${dataStr}${COLORS.reset}` : ` ${dataStr}`
    }
  }

  // Error stack
  if (entry.error) {
    output += `\n  | ${formatErrorForConsole(entry.error)}`
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
  const record: Record<string, unknown> = {
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
    record.error = serializeError(entry.error)
  }

  try {
    return stringifySafely(record)
  } catch (error) {
    return stringifySafely({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      ...(entry.namespace !== undefined && { namespace: entry.namespace }),
      data: '[Unserializable data]',
      serializationError: describeSerializationError(error),
    })
  }
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
