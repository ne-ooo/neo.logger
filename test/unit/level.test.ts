import { describe, it, expect } from 'vitest'
import { LogLevel, LogLevelName, parseLevel, shouldLog } from '../../src/core/level.js'

describe('LogLevel', () => {
  it('should have correct numeric values', () => {
    expect(LogLevel.DEBUG).toBe(0)
    expect(LogLevel.INFO).toBe(1)
    expect(LogLevel.WARN).toBe(2)
    expect(LogLevel.ERROR).toBe(3)
    expect(LogLevel.SILENT).toBe(4)
  })

  it('should map level names correctly', () => {
    expect(LogLevelName[LogLevel.DEBUG]).toBe('debug')
    expect(LogLevelName[LogLevel.INFO]).toBe('info')
    expect(LogLevelName[LogLevel.WARN]).toBe('warn')
    expect(LogLevelName[LogLevel.ERROR]).toBe('error')
    expect(LogLevelName[LogLevel.SILENT]).toBe('silent')
  })
})

describe('parseLevel', () => {
  it('should parse string levels', () => {
    expect(parseLevel('debug')).toBe(LogLevel.DEBUG)
    expect(parseLevel('info')).toBe(LogLevel.INFO)
    expect(parseLevel('warn')).toBe(LogLevel.WARN)
    expect(parseLevel('error')).toBe(LogLevel.ERROR)
    expect(parseLevel('silent')).toBe(LogLevel.SILENT)
  })

  it('should be case-insensitive', () => {
    expect(parseLevel('DEBUG')).toBe(LogLevel.DEBUG)
    expect(parseLevel('Info')).toBe(LogLevel.INFO)
    expect(parseLevel('WARN')).toBe(LogLevel.WARN)
  })

  it('should handle aliases', () => {
    expect(parseLevel('warning')).toBe(LogLevel.WARN)
    expect(parseLevel('none')).toBe(LogLevel.SILENT)
  })

  it('should parse numeric levels', () => {
    expect(parseLevel(0)).toBe(LogLevel.DEBUG)
    expect(parseLevel(1)).toBe(LogLevel.INFO)
    expect(parseLevel(2)).toBe(LogLevel.WARN)
    expect(parseLevel(3)).toBe(LogLevel.ERROR)
    expect(parseLevel(4)).toBe(LogLevel.SILENT)
  })

  it('should default to INFO for invalid levels', () => {
    expect(parseLevel('invalid')).toBe(LogLevel.INFO)
    expect(parseLevel('unknown')).toBe(LogLevel.INFO)
  })
})

describe('shouldLog', () => {
  it('should allow messages at or above minimum level', () => {
    expect(shouldLog(LogLevel.DEBUG, LogLevel.DEBUG)).toBe(true)
    expect(shouldLog(LogLevel.INFO, LogLevel.DEBUG)).toBe(true)
    expect(shouldLog(LogLevel.WARN, LogLevel.DEBUG)).toBe(true)
    expect(shouldLog(LogLevel.ERROR, LogLevel.DEBUG)).toBe(true)
  })

  it('should block messages below minimum level', () => {
    expect(shouldLog(LogLevel.DEBUG, LogLevel.INFO)).toBe(false)
    expect(shouldLog(LogLevel.INFO, LogLevel.WARN)).toBe(false)
    expect(shouldLog(LogLevel.WARN, LogLevel.ERROR)).toBe(false)
  })

  it('should respect INFO level filtering', () => {
    expect(shouldLog(LogLevel.DEBUG, LogLevel.INFO)).toBe(false)
    expect(shouldLog(LogLevel.INFO, LogLevel.INFO)).toBe(true)
    expect(shouldLog(LogLevel.WARN, LogLevel.INFO)).toBe(true)
    expect(shouldLog(LogLevel.ERROR, LogLevel.INFO)).toBe(true)
  })

  it('should block all logs at SILENT level', () => {
    expect(shouldLog(LogLevel.DEBUG, LogLevel.SILENT)).toBe(false)
    expect(shouldLog(LogLevel.INFO, LogLevel.SILENT)).toBe(false)
    expect(shouldLog(LogLevel.WARN, LogLevel.SILENT)).toBe(false)
    expect(shouldLog(LogLevel.ERROR, LogLevel.SILENT)).toBe(false)
  })
})
