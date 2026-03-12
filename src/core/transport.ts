import { appendFile } from 'node:fs/promises'
import type { LogEntry, Transport, FileTransportOptions, ConsoleTransportOptions } from '../types.js'
import { formatConsole, formatJSON } from './formatter.js'
import { shouldRotate, rotateFiles } from '../utils/rotate.js'

/**
 * Console transport - writes logs to stdout/stderr
 *
 * @example
 * ```typescript
 * const transport = new ConsoleTransport({
 *   stderr: true, // Use stderr for warn/error
 *   colors: true  // Enable ANSI colors
 * })
 * ```
 */
export class ConsoleTransport implements Transport {
  private useStderr: boolean
  private colors: boolean

  constructor(options: ConsoleTransportOptions = {}) {
    this.useStderr = options.stderr ?? true
    this.colors = options.colors ?? process.stdout.isTTY
  }

  async write(entry: LogEntry): Promise<void> {
    const formatted = formatConsole(entry, { colors: this.colors })

    // Use stderr for warn and error levels
    if (this.useStderr && (entry.level === 'warn' || entry.level === 'error')) {
      process.stderr.write(formatted + '\n')
    } else {
      process.stdout.write(formatted + '\n')
    }
  }
}

/**
 * File transport - writes logs to a file (JSON or text format)
 *
 * Supports optional file rotation based on size.
 *
 * @example
 * ```typescript
 * const transport = new FileTransport({
 *   path: 'app.log',
 *   format: 'json',
 *   rotate: true,
 *   maxSize: 10 * 1024 * 1024, // 10MB
 *   maxFiles: 5
 * })
 * ```
 */
export class FileTransport implements Transport {
  private path: string
  private format: 'json' | 'text'
  private rotate: boolean
  private maxSize: number
  private maxFiles: number

  constructor(options: FileTransportOptions) {
    this.path = options.path
    this.format = options.format ?? 'json'
    this.rotate = options.rotate ?? false
    this.maxSize = options.maxSize ?? 10 * 1024 * 1024 // 10MB default
    this.maxFiles = options.maxFiles ?? 5
  }

  async write(entry: LogEntry): Promise<void> {
    // Check if rotation is needed
    if (this.rotate && (await shouldRotate(this.path, this.maxSize))) {
      await rotateFiles(this.path, this.maxFiles)
    }

    // Format the entry
    const formatted =
      this.format === 'json' ? formatJSON(entry) : formatConsole(entry, { colors: false })

    // Append to file
    await appendFile(this.path, formatted + '\n', 'utf8')
  }
}

/**
 * Custom transport - user-provided function for handling log entries
 *
 * @example
 * ```typescript
 * const transport = new CustomTransport(async (entry) => {
 *   // Send to external service
 *   await fetch('https://logs.example.com', {
 *     method: 'POST',
 *     body: JSON.stringify(entry)
 *   })
 * })
 * ```
 */
export class CustomTransport implements Transport {
  private handler: (entry: LogEntry) => void | Promise<void>

  constructor(handler: (entry: LogEntry) => void | Promise<void>) {
    this.handler = handler
  }

  async write(entry: LogEntry): Promise<void> {
    await this.handler(entry)
  }
}
