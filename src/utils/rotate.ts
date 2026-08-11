import { stat, rename, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'

const fileOperationQueues = new Map<string, Promise<void>>()
const MAX_ROTATION_FILES = 10_000

/** @internal */
export function validateRotationSize(maxSize: number): void {
  if (!Number.isSafeInteger(maxSize) || maxSize < 1) {
    throw new RangeError('maxSize must be a positive safe integer')
  }
}

/** @internal */
export function validateRotationFileCount(maxFiles: number): void {
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > MAX_ROTATION_FILES) {
    throw new RangeError(`maxFiles must be an integer between 1 and ${String(MAX_ROTATION_FILES)}`)
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

/** @internal Serialize operations that must be atomic within this process. */
export function withFileLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const key = resolve(path)
  const previous = fileOperationQueues.get(key) ?? Promise.resolve()
  const result = previous.then(operation, operation)
  const tail = result.then(
    () => undefined,
    () => undefined,
  )

  fileOperationQueues.set(key, tail)
  void tail.then(() => {
    if (fileOperationQueues.get(key) === tail) {
      fileOperationQueues.delete(key)
    }
  })

  return result
}

/**
 * Check if a log file should be rotated based on size
 *
 * @param path - File path to check
 * @param maxSize - Maximum file size in bytes
 * @returns True if file should be rotated
 *
 * @example
 * ```typescript
 * if (await shouldRotate('app.log', 10 * 1024 * 1024)) {
 *   await rotateFiles('app.log', 5)
 * }
 * ```
 */
export async function shouldRotate(path: string, maxSize: number): Promise<boolean> {
  validateRotationSize(maxSize)
  try {
    const stats = await stat(path)
    return stats.size >= maxSize
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }
    throw error
  }
}

/**
 * Rotate log files (file.log -> file.1.log -> file.2.log -> ...)
 *
 * - Deletes the oldest file (file.{maxFiles}.log)
 * - Renames all existing backup files (file.1.log -> file.2.log)
 * - Renames current file to backup (file.log -> file.1.log)
 *
 * @param path - Base file path
 * @param maxFiles - Maximum number of backup files to keep
 *
 * @example
 * ```typescript
 * await rotateFiles('app.log', 5)
 * // Before: app.log, app.1.log, app.2.log, ..., app.5.log
 * // After:  [new], app.1.log, app.2.log, ..., app.5.log
 * ```
 */
export async function rotateFiles(path: string, maxFiles: number): Promise<void> {
  validateRotationFileCount(maxFiles)
  await withFileLock(path, () => rotateFilesUnlocked(path, maxFiles))
}

/** @internal Rotate while the caller owns the path lock. */
export async function rotateFilesUnlocked(path: string, maxFiles: number): Promise<void> {
  validateRotationFileCount(maxFiles)
  const oldestPath = `${path}.${maxFiles}`
  try {
    await unlink(oldestPath)
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }

  for (let i = maxFiles - 1; i >= 1; i--) {
    const oldPath = `${path}.${i}`
    const newPath = `${path}.${i + 1}`

    try {
      await rename(oldPath, newPath)
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error
      }
    }
  }

  try {
    await rename(path, `${path}.1`)
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }
}
