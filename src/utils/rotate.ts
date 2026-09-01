import { lstat, readdir, rename, unlink } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

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

function unsafeRotationTargetError(path: string): NodeJS.ErrnoException {
  const error = new Error(
    `Refusing to rotate non-regular file or symbolic link: ${path}`,
  ) as NodeJS.ErrnoException
  error.code = 'EINVAL'
  return error
}

async function validateRotationTarget(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path)
    if (!stats.isFile()) {
      throw unsafeRotationTargetError(path)
    }
    return true
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }
    throw error
  }
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
    const stats = await lstat(path)
    if (!stats.isFile()) {
      throw unsafeRotationTargetError(path)
    }
    return stats.size >= maxSize
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }
    throw error
  }
}

/**
 * Rotate log files (file.log -> file.log.1 -> file.log.2 -> ...)
 *
 * - Deletes the oldest file (file.log.{maxFiles})
 * - Renames all existing backup files (file.log.1 -> file.log.2)
 * - Renames current file to backup (file.log -> file.log.1)
 *
 * @param path - Base file path
 * @param maxFiles - Maximum number of backup files to keep
 *
 * @example
 * ```typescript
 * await rotateFiles('app.log', 5)
 * // Before: app.log, app.log.1, app.log.2, ..., app.log.5
 * // After:  [base absent], app.log.1, app.log.2, ..., app.log.5
 * ```
 */
export async function rotateFiles(path: string, maxFiles: number): Promise<void> {
  validateRotationFileCount(maxFiles)
  await withFileLock(path, () => rotateFilesUnlocked(path, maxFiles))
}

/** @internal Rotate while the caller owns the path lock. */
export async function rotateFilesUnlocked(path: string, maxFiles: number): Promise<void> {
  validateRotationFileCount(maxFiles)
  await validateRotationTarget(path)

  const directory = dirname(path)
  const backupPrefix = `${basename(path)}.`
  let directoryEntries: string[]
  try {
    directoryEntries = await readdir(directory)
  } catch (error) {
    if (isMissingFileError(error)) {
      return
    }
    throw error
  }

  const existingBackups: number[] = []
  for (const entry of directoryEntries) {
    if (!entry.startsWith(backupPrefix)) {
      continue
    }

    const suffix = entry.slice(backupPrefix.length)
    if (!/^[1-9]\d*$/u.test(suffix)) {
      continue
    }

    const index = Number(suffix)
    if (Number.isSafeInteger(index) && index <= maxFiles) {
      if (await validateRotationTarget(`${path}.${String(index)}`)) {
        existingBackups.push(index)
      }
    }
  }
  existingBackups.sort((left, right) => right - left)

  for (const index of existingBackups) {
    const oldPath = `${path}.${String(index)}`

    try {
      if (index === maxFiles) {
        await unlink(oldPath)
      } else {
        await rename(oldPath, `${path}.${String(index + 1)}`)
      }
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error
      }
    }
  }

  if (!(await validateRotationTarget(path))) {
    return
  }
  try {
    await rename(path, `${path}.1`)
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }
}
