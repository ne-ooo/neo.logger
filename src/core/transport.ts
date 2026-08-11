import { constants } from 'node:fs'
import { lstat, open, stat } from 'node:fs/promises'
import type { LogEntry, Transport, FileTransportOptions, ConsoleTransportOptions } from '../types.js'
import { formatConsole, formatJSON } from './formatter.js'
import {
  rotateFilesUnlocked,
  validateRotationFileCount,
  validateRotationSize,
  withFileLock,
} from '../utils/rotate.js'

function writeToStream(stream: NodeJS.WriteStream, output: string): void | Promise<void> {
  if (stream.write(output)) {
    return
  }

  return new Promise((resolve, reject) => {
    const onDrain = () => {
      stream.off('error', onError)
      resolve()
    }
    const onError = (error: Error) => {
      stream.off('drain', onDrain)
      reject(error)
    }

    stream.once('drain', onDrain)
    stream.once('error', onError)
  })
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

async function getCurrentFileSize(path: string, followSymlinks: boolean): Promise<number> {
  try {
    const stats = followSymlinks ? await stat(path) : await lstat(path)
    if (!followSymlinks && stats.isSymbolicLink()) {
      const error = new Error(`Refusing to write through symbolic link: ${path}`) as NodeJS.ErrnoException
      error.code = 'ELOOP'
      throw error
    }
    return stats.size
  } catch (error) {
    if (isMissingFileError(error)) {
      return 0
    }
    throw error
  }
}

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

  write(entry: LogEntry): void | Promise<void> {
    const formatted = formatConsole(entry, { colors: this.colors })
    const output = formatted + '\n'

    if (this.useStderr && (entry.level === 'warn' || entry.level === 'error')) {
      return writeToStream(process.stderr, output)
    }
    return writeToStream(process.stdout, output)
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
  private mode: number
  private followSymlinks: boolean

  constructor(options: FileTransportOptions) {
    this.path = options.path
    this.format = options.format ?? 'json'
    this.rotate = options.rotate ?? false
    this.maxSize = options.maxSize ?? 10 * 1024 * 1024 // 10MB default
    this.maxFiles = options.maxFiles ?? 5
    this.mode = options.mode ?? 0o600
    this.followSymlinks = options.followSymlinks ?? false

    validateRotationSize(this.maxSize)
    validateRotationFileCount(this.maxFiles)
    if (!Number.isSafeInteger(this.mode) || this.mode < 0 || this.mode > 0o777) {
      throw new RangeError('mode must be an integer between 0o000 and 0o777')
    }
  }

  async write(entry: LogEntry): Promise<void> {
    await this.writeBatch([entry])
  }

  async writeBatch(entries: readonly LogEntry[]): Promise<void> {
    if (entries.length === 0) {
      return
    }

    const outputs = entries.map((entry) => {
      const formatted =
        this.format === 'json' ? formatJSON(entry) : formatConsole(entry, { colors: false })
      return formatted + '\n'
    })

    await withFileLock(this.path, async () => {
      let currentSize = 0
      if (!this.followSymlinks) {
        currentSize = await getCurrentFileSize(this.path, false)
      } else if (this.rotate) {
        currentSize = await getCurrentFileSize(this.path, true)
      }

      if (!this.rotate) {
        await this.append(outputs.join(''))
        return
      }

      let chunk: string[] = []
      let chunkSize = 0

      for (const output of outputs) {
        if (currentSize + chunkSize >= this.maxSize) {
          if (chunkSize > 0) {
            await this.append(chunk.join(''))
          }
          await rotateFilesUnlocked(this.path, this.maxFiles)
          currentSize = 0
          chunk = []
          chunkSize = 0
        }

        chunk.push(output)
        chunkSize += Buffer.byteLength(output)
      }

      if (chunkSize > 0) {
        await this.append(chunk.join(''))
      }
    })
  }

  private async append(output: string): Promise<void> {
    let flags = constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY
    if (!this.followSymlinks && typeof constants.O_NOFOLLOW === 'number') {
      flags |= constants.O_NOFOLLOW
    }

    const file = await open(this.path, flags, this.mode)
    try {
      await file.appendFile(output, 'utf8')
    } finally {
      await file.close()
    }
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
  private handler: (entry: LogEntry) => unknown

  constructor(handler: (entry: LogEntry) => unknown) {
    this.handler = handler
  }

  write(entry: LogEntry): void | Promise<void> {
    const result = this.handler(entry)
    if (isPromiseLike(result)) {
      return Promise.resolve(result).then(() => undefined)
    }
  }
}
