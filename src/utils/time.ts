/**
 * Format timestamp as ISO 8601 string
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns ISO 8601 formatted string
 *
 * @example
 * ```typescript
 * formatTimestamp(1705318245123)
 * // '2024-01-15T10:30:45.123Z'
 * ```
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

/**
 * Format timestamp as human-readable string
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable time string
 *
 * @example
 * ```typescript
 * formatHumanTime(1705318245123)
 * // '2024-01-15 10:30:45'
 * ```
 */
export function formatHumanTime(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

/**
 * Get current timestamp in milliseconds
 *
 * @returns Current Unix timestamp
 *
 * @example
 * ```typescript
 * const now = getCurrentTimestamp()
 * // 1705318245123
 * ```
 */
export function getCurrentTimestamp(): number {
  return Date.now()
}
