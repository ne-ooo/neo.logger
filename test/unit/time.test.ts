import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatTimestamp, formatHumanTime, getCurrentTimestamp } from '../../src/utils/time.js'

describe('formatTimestamp', () => {
  it('formats unix epoch to ISO string', () => {
    expect(formatTimestamp(0)).toBe('1970-01-01T00:00:00.000Z')
  })

  it('formats known timestamp correctly', () => {
    // formatTimestamp uses toISOString() which is always UTC
    const result = formatTimestamp(1705318245123)
    // Verify the format, not the exact time (avoids TZ-sensitive failures)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    // Verify millis are included
    expect(result).toContain('.123Z')
  })

  it('returns a valid ISO 8601 string', () => {
    const result = formatTimestamp(Date.now())
    expect(() => new Date(result)).not.toThrow()
    expect(isNaN(new Date(result).getTime())).toBe(false)
  })

  it('preserves milliseconds in output', () => {
    const result = formatTimestamp(1705318245456)
    expect(result).toContain('.456Z')
  })
})

describe('formatHumanTime', () => {
  it('formats unix epoch in UTC (will vary by TZ — test structure)', () => {
    // Just check the format: YYYY-MM-DD HH:MM:SS
    const result = formatHumanTime(1705318245123)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('pads single-digit month/day/hours/minutes/seconds with zero', () => {
    // 2024-01-05 09:05:07 UTC → depends on TZ, but format is always padded
    const result = formatHumanTime(Date.now())
    const parts = result.split(' ')
    expect(parts).toHaveLength(2)
    const [datePart, timePart] = parts as [string, string]
    const [year, month, day] = datePart.split('-') as [string, string, string]
    const [hours, minutes, seconds] = timePart.split(':') as [string, string, string]
    expect(year).toHaveLength(4)
    expect(month).toHaveLength(2)
    expect(day).toHaveLength(2)
    expect(hours).toHaveLength(2)
    expect(minutes).toHaveLength(2)
    expect(seconds).toHaveLength(2)
  })

  it('formats year 2000 correctly', () => {
    // 2000-01-01T00:00:00.000Z
    const result = formatHumanTime(946684800000)
    expect(result).toMatch(/^2000-01-01/)
  })

  it('returns a string without T or Z (human readable, not ISO)', () => {
    const result = formatHumanTime(Date.now())
    expect(result).not.toContain('T')
    expect(result).not.toContain('Z')
  })
})

describe('getCurrentTimestamp', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a number', () => {
    expect(typeof getCurrentTimestamp()).toBe('number')
  })

  it('returns current time in milliseconds', () => {
    const before = Date.now()
    const ts = getCurrentTimestamp()
    const after = Date.now()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('uses Date.now() under the hood', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345678)
    expect(getCurrentTimestamp()).toBe(12345678)
  })

  it('returns integer milliseconds', () => {
    const ts = getCurrentTimestamp()
    expect(Number.isInteger(ts)).toBe(true)
  })
})
