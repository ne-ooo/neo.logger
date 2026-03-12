/**
 * Log entry interface - represents a single log message
 */
export interface LogEntry {
  /** Timestamp in milliseconds */
  timestamp: number
  /** Log level name (debug, info, warn, error) */
  level: string
  /** Log message */
  message: string
  /** Optional namespace for grouping logs */
  namespace?: string
  /** Additional structured data */
  data?: Record<string, any>
  /** Error object (for error-level logs) */
  error?: Error
}

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /** Minimum log level (default: 'info') */
  level?: string | number
  /** Namespace for this logger instance */
  namespace?: string
  /** Output transports (default: [ConsoleTransport]) */
  transports?: Transport[]
}

/**
 * Transport interface - defines output destination
 */
export interface Transport {
  /** Write a log entry to the transport */
  write(entry: LogEntry): Promise<void>
}

/**
 * Formatter options for console output
 */
export interface FormatterOptions {
  /** Enable ANSI colors (default: true) */
  colors?: boolean
  /** Show timestamps (default: true) */
  timestamp?: boolean
}

/**
 * File transport options
 */
export interface FileTransportOptions {
  /** File path to write logs to */
  path: string
  /** Format: 'json' or 'text' (default: 'json') */
  format?: 'json' | 'text'
  /** Enable file rotation (default: false) */
  rotate?: boolean
  /** Maximum file size in bytes before rotation (default: 10MB) */
  maxSize?: number
  /** Maximum number of backup files to keep (default: 5) */
  maxFiles?: number
}

/**
 * Console transport options
 */
export interface ConsoleTransportOptions {
  /** Use stderr for warn/error levels (default: true) */
  stderr?: boolean
  /** Enable colors (default: true if TTY) */
  colors?: boolean
}
