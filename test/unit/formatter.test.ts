import { describe, it, expect } from 'vitest'
import { formatConsole, formatJSON } from '../../src/core/formatter.js'
import type { LogEntry } from '../../src/types.js'

describe('formatConsole', () => {
  const baseEntry: LogEntry = {
    timestamp: 1705318245123,
    level: 'info',
    message: 'Test message',
  }

  it('should format basic log entry', () => {
    const result = formatConsole(baseEntry, { colors: false })
    expect(result).toContain('2024-01-15')
    expect(result).toContain('INFO')
    expect(result).toContain('Test message')
  })

  it('should include namespace when provided', () => {
    const entry: LogEntry = {
      ...baseEntry,
      namespace: 'app',
    }
    const result = formatConsole(entry, { colors: false })
    expect(result).toContain('[app]')
  })

  it('should include structured data when provided', () => {
    const entry: LogEntry = {
      ...baseEntry,
      data: { userId: 123, action: 'login' },
    }
    const result = formatConsole(entry, { colors: false })
    expect(result).toContain('{"userId":123,"action":"login"}')
  })

  it('should include error stack when provided', () => {
    const error = new Error('Test error')
    const entry: LogEntry = {
      ...baseEntry,
      error,
    }
    const result = formatConsole(entry, { colors: false })
    expect(result).toContain('Error: Test error')
    expect(result).toContain('at ')
  })

  it('should pad log level to 5 characters', () => {
    const infoEntry: LogEntry = { ...baseEntry, level: 'info' }
    const warnEntry: LogEntry = { ...baseEntry, level: 'warn' }

    const infoResult = formatConsole(infoEntry, { colors: false })
    const warnResult = formatConsole(warnEntry, { colors: false })

    // Both should have same spacing
    expect(infoResult.indexOf('Test message')).toBe(warnResult.indexOf('Test message'))
  })

  it('should disable timestamp when timestamp: false', () => {
    const result = formatConsole(baseEntry, { colors: false, timestamp: false })
    expect(result).not.toContain('2024-01-15')
  })

  it('should include ANSI colors when colors: true', () => {
    const result = formatConsole(baseEntry, { colors: true })
    expect(result).toContain('\x1b[')
  })

  it('should not include ANSI colors when colors: false', () => {
    const result = formatConsole(baseEntry, { colors: false })
    expect(result).not.toContain('\x1b[')
  })

  it('should use different colors for different log levels', () => {
    const debugEntry: LogEntry = { ...baseEntry, level: 'debug' }
    const infoEntry: LogEntry = { ...baseEntry, level: 'info' }
    const warnEntry: LogEntry = { ...baseEntry, level: 'warn' }
    const errorEntry: LogEntry = { ...baseEntry, level: 'error' }

    const debugResult = formatConsole(debugEntry, { colors: true })
    const infoResult = formatConsole(infoEntry, { colors: true })
    const warnResult = formatConsole(warnEntry, { colors: true })
    const errorResult = formatConsole(errorEntry, { colors: true })

    // Each should have different color codes
    expect(debugResult).not.toBe(infoResult)
    expect(infoResult).not.toBe(warnResult)
    expect(warnResult).not.toBe(errorResult)
  })

  it('should escape record-forging and terminal control characters', () => {
    const result = formatConsole(
      {
        ...baseEntry,
        level: 'info\nforged',
        namespace: 'api\r\x1b]8;;https://example.com\x07',
        message: 'accepted\nERROR forged\x1b[2J',
      },
      { colors: false, timestamp: false },
    )

    expect(result).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/u)
    expect(result).toContain('\\n')
    expect(result).toContain('\\u001b')
    expect(result.split('\n')).toHaveLength(1)
  })

  it('should prefix every physical error continuation line', () => {
    const error = new Error('failed')
    error.stack = 'Error: failed\n    at main (app.ts:1:1)\nFORGED\x1b[2J'

    const result = formatConsole({ ...baseEntry, error }, { colors: false })
    const lines = result.split('\n')

    expect(lines).toHaveLength(4)
    for (const line of lines.slice(1)) {
      expect(line.startsWith('  | ')).toBe(true)
      expect(line).not.toContain('\x1b')
    }
  })
})

describe('formatJSON', () => {
  const baseEntry: LogEntry = {
    timestamp: 1705318245123,
    level: 'info',
    message: 'Test message',
  }

  it('should format basic log entry as JSON', () => {
    const result = formatJSON(baseEntry)
    const parsed = JSON.parse(result)

    expect(parsed.timestamp).toBe(1705318245123)
    expect(parsed.level).toBe('info')
    expect(parsed.message).toBe('Test message')
  })

  it('should include namespace when provided', () => {
    const entry: LogEntry = {
      ...baseEntry,
      namespace: 'app',
    }
    const result = formatJSON(entry)
    const parsed = JSON.parse(result)

    expect(parsed.namespace).toBe('app')
  })

  it('should include data when provided', () => {
    const entry: LogEntry = {
      ...baseEntry,
      data: { userId: 123, action: 'login' },
    }
    const result = formatJSON(entry)
    const parsed = JSON.parse(result)

    expect(parsed.data).toEqual({ userId: 123, action: 'login' })
  })

  it('should include error when provided', () => {
    const error = new Error('Test error')
    const entry: LogEntry = {
      ...baseEntry,
      error,
    }
    const result = formatJSON(entry)
    const parsed = JSON.parse(result)

    expect(parsed.error.message).toBe('Test error')
    expect(parsed.error.name).toBe('Error')
    expect(parsed.error.stack).toBeTruthy()
  })

  it('should not include undefined fields', () => {
    const result = formatJSON(baseEntry)
    const parsed = JSON.parse(result)

    expect(parsed.namespace).toBeUndefined()
    expect(parsed.data).toBeUndefined()
    expect(parsed.error).toBeUndefined()
  })

  it('should produce valid JSON', () => {
    const entry: LogEntry = {
      ...baseEntry,
      namespace: 'app:db',
      data: { value: 'test' },
    }
    const result = formatJSON(entry)

    expect(() => JSON.parse(result)).not.toThrow()
  })

  it('should serialize BigInt and circular references without dropping the entry', () => {
    const data: Record<string, any> = { id: 1n }
    data.self = data

    const result = formatJSON({ ...baseEntry, data })
    const parsed = JSON.parse(result)

    expect(parsed.message).toBe('Test message')
    expect(parsed.data.id).toBe('1')
    expect(parsed.data.self).toBe('[Circular]')
  })

  it('should preserve the core entry when a data getter throws', () => {
    const data = Object.create(null) as Record<string, any>
    Object.defineProperty(data, 'secret', {
      enumerable: true,
      get() {
        throw new Error('getter failed')
      },
    })

    const result = formatJSON({ ...baseEntry, data })
    const parsed = JSON.parse(result)

    expect(parsed.message).toBe('Test message')
    expect(parsed.data).toBe('[Unserializable data]')
    expect(parsed.serializationError).toContain('getter failed')
  })

  it('should include error causes and custom properties', () => {
    const cause = new Error('root cause')
    const error = new Error('outer error', { cause }) as Error & { code: string }
    error.code = 'E_OUTER'

    const result = formatJSON({ ...baseEntry, error })
    const parsed = JSON.parse(result)

    expect(parsed.error.code).toBe('E_OUTER')
    expect(parsed.error.cause.message).toBe('root cause')
  })

  it('should format serialized error-like objects', () => {
    const error = {
      name: 'RangeError',
      message: 'Outside range',
      stack: 'RangeError: Outside range\n    at worker.js:1:1',
    }

    const consoleOutput = formatConsole({ ...baseEntry, error }, { colors: false })
    const jsonOutput = JSON.parse(formatJSON({ ...baseEntry, error }))

    expect(consoleOutput).toContain('RangeError: Outside range')
    expect(jsonOutput.error).toEqual(error)
  })

  it('should escape raw Unicode controls while preserving parsed JSON values', () => {
    const message = 'safe\u202eunsafe'
    const result = formatJSON({ ...baseEntry, message })

    expect(result).not.toContain('\u202e')
    expect(result).toContain('\\u202e')
    expect(JSON.parse(result).message).toBe(message)
  })
})
