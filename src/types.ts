/** Accepted string forms for logger level configuration. */
export type LogLevelString =
  | 'debug'
  | 'info'
  | 'warn'
  | 'warning'
  | 'error'
  | 'silent'
  | 'none'

/** Accepted logger level configuration values. */
export type LogLevelInput = LogLevelString | 0 | 1 | 2 | 3 | 4

/** Error values accepted by `Logger.error()`, including cross-realm errors. */
export interface ErrorLike {
  message: string
  name?: string
  stack?: string
  cause?: unknown
}

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
  /** Error or serialized error-like object (for error-level logs) */
  error?: ErrorLike
}

/** Path-based redaction settings. Paths support `*` and recursive `**` wildcards. */
export interface RedactionOptions {
  paths: readonly string[]
  /** Replacement written instead of a sensitive value (default: '[REDACTED]') */
  censor?: string
}

/** `true` enables common secret paths; an array or options object supplies custom paths. */
export type RedactionConfig = true | readonly string[] | RedactionOptions

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /** Minimum log level (default: 'info') */
  level?: LogLevelInput
  /** Namespace for this logger instance */
  namespace?: string
  /** Output transports (default: [ConsoleTransport]) */
  transports?: Transport[]
  /** Maximum pending writes per transport before overflow handling (default: 10000) */
  maxQueueSize?: number
  /** Behavior when a transport queue is full (default: 'drop-newest') */
  overflowStrategy?: QueueOverflowStrategy
  /** Redact structured data before any transport receives it */
  redact?: RedactionConfig
}

/** Behavior when a transport reaches its pending-write limit */
export type QueueOverflowStrategy = 'drop-newest' | 'throw'

/**
 * Transport interface - defines output destination
 */
export interface Transport {
  /** Write a log entry to the transport */
  write(entry: LogEntry): void | Promise<void>
  /** Write an ordered group of entries more efficiently when supported */
  writeBatch?(entries: readonly LogEntry[]): void | Promise<void>
  /** Flush transport-owned buffers after all scheduled writes complete */
  flush?(): void | Promise<void>
  /** Release transport-owned resources */
  close?(): void | Promise<void>
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
  /** Positive safe-integer file size in bytes before rotation (default: 10MB) */
  maxSize?: number
  /** Number of backup files to keep, from 1 through 10000 (default: 5) */
  maxFiles?: number
  /** Permissions used when creating a log file (default: 0o600) */
  mode?: number
  /** Allow the final path component to be a symbolic link (default: false) */
  followSymlinks?: boolean
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
