import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
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

function formatFileMode(mode: number): string {
  return `0o${mode.toString(8).padStart(3, '0')}`
}

function unsafeLogFileError(path: string, reason: string, code: string): NodeJS.ErrnoException {
  const error = new Error(`Refusing unsafe log file "${path}": ${reason}`) as NodeJS.ErrnoException
  error.code = code
  return error
}

function validateLogFileStats(stats: Stats, path: string, mode: number): void {
  if (!stats.isFile()) {
    throw unsafeLogFileError(path, 'target is not a regular file', 'EINVAL')
  }

  if (process.platform === 'win32') {
    return
  }

  if (typeof process.geteuid === 'function') {
    const expectedUserId = process.geteuid()
    if (stats.uid !== expectedUserId) {
      throw unsafeLogFileError(
        path,
        `target is owned by uid ${String(stats.uid)}; expected current process uid ${String(expectedUserId)}`,
        'EPERM',
      )
    }
  }

  const actualMode = stats.mode & 0o777
  const unexpectedPermissions = actualMode & ~mode
  if (unexpectedPermissions !== 0) {
    throw unsafeLogFileError(
      path,
      `permissions ${formatFileMode(actualMode)} exceed configured maximum ${formatFileMode(mode)}`,
      'EACCES',
    )
  }
}

async function validateOpenedLogFile(file: FileHandle, path: string, mode: number): Promise<Stats> {
  const stats = await file.stat()
  validateLogFileStats(stats, path, mode)
  return stats
}

function secureOpenFlags(create: boolean): number {
  let flags = constants.O_APPEND | constants.O_WRONLY
  if (create) {
    flags |= constants.O_CREAT
  }
  if (typeof constants.O_NOFOLLOW === 'number') {
    flags |= constants.O_NOFOLLOW
  }
  if (process.platform !== 'win32' && typeof constants.O_NONBLOCK === 'number') {
    flags |= constants.O_NONBLOCK
  }
  return flags
}

interface OpenedLogFile {
  file: FileHandle
  size: number
}

async function openValidatedLogFile(path: string, mode: number): Promise<OpenedLogFile | undefined> {
  let file: FileHandle
  try {
    file = await open(path, secureOpenFlags(false), mode)
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined
    }
    throw error
  }

  try {
    const size = (await validateOpenedLogFile(file, path, mode)).size
    return { file, size }
  } catch (error) {
    await file.close()
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
    if (this.rotate && this.followSymlinks) {
      throw new RangeError(
        'rotate and followSymlinks cannot both be enabled because rotation cannot safely preserve a symbolic-link destination',
      )
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
      if (!this.rotate) {
        await this.append(outputs.join(''))
        return
      }

      let openedFile = await openValidatedLogFile(this.path, this.mode)
      let currentSize = openedFile?.size ?? 0

      try {
        let chunk: string[] = []
        let chunkSize = 0

        for (const output of outputs) {
          if (currentSize + chunkSize >= this.maxSize) {
            if (chunkSize > 0) {
              if (openedFile !== undefined) {
                const file = openedFile.file
                openedFile = undefined
                await this.appendToOpenedFile(file, chunk.join(''))
              } else {
                await this.append(chunk.join(''))
              }
            } else if (openedFile !== undefined) {
              const file = openedFile.file
              openedFile = undefined
              await file.close()
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
          if (openedFile !== undefined) {
            const file = openedFile.file
            openedFile = undefined
            await this.appendToOpenedFile(file, chunk.join(''))
          } else {
            await this.append(chunk.join(''))
          }
        }
      } finally {
        await openedFile?.file.close()
      }
    })
  }

  private async appendToOpenedFile(file: FileHandle, output: string): Promise<void> {
    try {
      await file.appendFile(output, 'utf8')
    } finally {
      await file.close()
    }
  }

  private async append(output: string): Promise<void> {
    let flags = secureOpenFlags(true)
    if (this.followSymlinks && typeof constants.O_NOFOLLOW === 'number') {
      flags &= ~constants.O_NOFOLLOW
    }

    const file = await open(this.path, flags, this.mode)
    try {
      await validateOpenedLogFile(file, this.path, this.mode)
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
