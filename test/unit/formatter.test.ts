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
})
