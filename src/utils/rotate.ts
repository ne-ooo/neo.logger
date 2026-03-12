import { stat, rename, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'

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
  if (!existsSync(path)) {
    return false
  }

  try {
    const stats = await stat(path)
    return stats.size >= maxSize
  } catch {
    return false
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
  // Delete oldest file
  const oldestPath = `${path}.${maxFiles}`
  if (existsSync(oldestPath)) {
    await unlink(oldestPath)
  }

  // Rotate existing files
  for (let i = maxFiles - 1; i >= 1; i--) {
    const oldPath = `${path}.${i}`
    const newPath = `${path}.${i + 1}`

    if (existsSync(oldPath)) {
      await rename(oldPath, newPath)
    }
  }

  // Rotate current file
  if (existsSync(path)) {
    await rename(path, `${path}.1`)
  }
}
