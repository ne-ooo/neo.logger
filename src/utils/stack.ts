/**
 * Parse error stack trace into structured format
 *
 * @param error - Error object with stack trace
 * @returns Parsed stack frames
 *
 * @example
 * ```typescript
 * const error = new Error('Test error')
 * const frames = parseStack(error)
 * // [
 * //   { file: 'app.ts', line: 42, column: 10, function: 'main' },
 * //   ...
 * // ]
 * ```
 */
export interface StackFrame {
  file?: string
  line?: number
  column?: number
  function?: string
}

export function parseStack(error: Error): StackFrame[] {
  const stack = error.stack
  if (!stack) {
    return []
  }

  const frames: StackFrame[] = []
  const lines = stack.split('\n').slice(1) // Skip first line (error message)

  for (const line of lines) {
    const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/)
    if (match) {
      const [, func, file, lineStr, colStr] = match
      const frame: StackFrame = {}
      if (func) frame.function = func.trim()
      if (file) frame.file = file.trim()
      if (lineStr) frame.line = parseInt(lineStr, 10)
      if (colStr) frame.column = parseInt(colStr, 10)
      frames.push(frame)
    }
  }

  return frames
}

/**
 * Format stack trace for display
 *
 * @param error - Error object
 * @returns Formatted stack trace string
 *
 * @example
 * ```typescript
 * const error = new Error('Test error')
 * console.log(formatStack(error))
 * // at main (app.ts:42:10)
 * // at start (index.ts:15:3)
 * ```
 */
export function formatStack(error: Error): string {
  const frames = parseStack(error)
  return frames
    .map((frame) => {
      let result = '  at '
      if (frame.function) {
        result += `${frame.function} `
      }
      if (frame.file) {
        result += `(${frame.file}:${frame.line || 0}:${frame.column || 0})`
      }
      return result
    })
    .join('\n')
}
