import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Logger } from '../../src/core/logger.js'
import { LogLevel } from '../../src/core/level.js'
import { CustomTransport } from '../../src/core/transport.js'
import type { LogEntry } from '../../src/types.js'

describe('Logger', () => {
  let entries: LogEntry[] = []
  let mockTransport: any

  beforeEach(() => {
    entries = []
    mockTransport = new CustomTransport((entry: LogEntry) => {
      entries.push(entry)
    })
  })

  describe('constructor', () => {
    it('should create logger with default level (info)', () => {
      const logger = new Logger()
      expect(logger.getLevel()).toBe(LogLevel.INFO)
    })

    it('should create logger with custom level', () => {
      const logger = new Logger({ level: 'debug' })
      expect(logger.getLevel()).toBe(LogLevel.DEBUG)
    })

    it('should accept numeric level', () => {
      const logger = new Logger({ level: 0 })
      expect(logger.getLevel()).toBe(LogLevel.DEBUG)
    })

    it('should create logger with namespace', () => {
      const logger = new Logger({ namespace: 'app', transports: [mockTransport] })
      logger.info('Test')

      expect(entries[0]?.namespace).toBe('app')
    })

    it('should use provided transports', () => {
      const logger = new Logger({ transports: [mockTransport] })
      logger.info('Test')

      expect(entries).toHaveLength(1)
    })
  })

  describe('log methods', () => {
    it('should log debug messages', () => {
      const logger = new Logger({ level: 'debug', transports: [mockTransport] })
      logger.debug('Debug message')

      expect(entries[0]?.level).toBe('debug')
      expect(entries[0]?.message).toBe('Debug message')
    })

    it('should log info messages', () => {
      const logger = new Logger({ transports: [mockTransport] })
      logger.info('Info message')

      expect(entries[0]?.level).toBe('info')
      expect(entries[0]?.message).toBe('Info message')
    })

    it('should log warn messages', () => {
      const logger = new Logger({ transports: [mockTransport] })
      logger.warn('Warn message')

      expect(entries[0]?.level).toBe('warn')
      expect(entries[0]?.message).toBe('Warn message')
    })

    it('should log error messages', () => {
      const logger = new Logger({ transports: [mockTransport] })
      logger.error('Error message')

      expect(entries[0]?.level).toBe('error')
      expect(entries[0]?.message).toBe('Error message')
    })

    it('should include structured data', () => {
      const logger = new Logger({ transports: [mockTransport] })
      logger.info('Test', { userId: 123 })

      expect(entries[0]?.data).toEqual({ userId: 123 })
    })

    it('should include error object', () => {
      const logger = new Logger({ transports: [mockTransport] })
      const error = new Error('Test error')
      logger.error('Failed', error)

      expect(entries[0]?.error).toBe(error)
    })

    it('should handle error method with data only', () => {
      const logger = new Logger({ transports: [mockTransport] })
      logger.error('Failed', { code: 'ERR001' } as any)

      expect(entries[0]?.data).toEqual({ code: 'ERR001' })
      expect(entries[0]?.error).toBeUndefined()
    })

    it('should handle error method with both error and data', () => {
      const logger = new Logger({ transports: [mockTransport] })
      const error = new Error('Test error')
      logger.error('Failed', error, { code: 'ERR001' })

      expect(entries[0]?.error).toBe(error)
      expect(entries[0]?.data).toEqual({ code: 'ERR001' })
    })

    it('should include timestamp', () => {
      const logger = new Logger({ transports: [mockTransport] })
      const before = Date.now()
      logger.info('Test')
      const after = Date.now()

      const timestamp = entries[0]?.timestamp
      expect(timestamp).toBeDefined()
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('level filtering', () => {
    it('should filter out debug messages when level is info', () => {
      const logger = new Logger({ level: 'info', transports: [mockTransport] })
      logger.debug('Debug')
      logger.info('Info')

      expect(entries).toHaveLength(1)
      expect(entries[0]?.level).toBe('info')
    })

    it('should filter out info messages when level is warn', () => {
      const logger = new Logger({ level: 'warn', transports: [mockTransport] })
      logger.debug('Debug')
      logger.info('Info')
      logger.warn('Warn')

      expect(entries).toHaveLength(1)
      expect(entries[0]?.level).toBe('warn')
    })

    it('should filter out all messages when level is silent', () => {
      const logger = new Logger({ level: 'silent', transports: [mockTransport] })
      logger.debug('Debug')
      logger.info('Info')
      logger.warn('Warn')
      logger.error('Error')

      expect(entries).toHaveLength(0)
    })

    it('should allow all messages when level is debug', () => {
      const logger = new Logger({ level: 'debug', transports: [mockTransport] })
      logger.debug('Debug')
      logger.info('Info')
      logger.warn('Warn')
      logger.error('Error')

      expect(entries).toHaveLength(4)
    })
  })

  describe('setLevel', () => {
    it('should change log level dynamically', () => {
      const logger = new Logger({ level: 'info', transports: [mockTransport] })

      logger.debug('Should not log')
      expect(entries).toHaveLength(0)

      logger.setLevel('debug')
      logger.debug('Should log')
      expect(entries).toHaveLength(1)
    })

    it('should accept numeric level', () => {
      const logger = new Logger({ transports: [mockTransport] })
      logger.setLevel(0) // DEBUG

      expect(logger.getLevel()).toBe(LogLevel.DEBUG)
    })
  })

  describe('child loggers', () => {
    it('should create child with nested namespace', () => {
      const parent = new Logger({ namespace: 'app', transports: [mockTransport] })
      const child = parent.child('database')

      child.info('Test')
      expect(entries[0]?.namespace).toBe('app:database')
    })

    it('should create deeply nested namespaces', () => {
      const parent = new Logger({ namespace: 'app', transports: [mockTransport] })
      const child1 = parent.child('database')
      const child2 = child1.child('redis')

      child2.info('Test')
      expect(entries[0]?.namespace).toBe('app:database:redis')
    })

    it('should inherit parent level', () => {
      const parent = new Logger({ level: 'warn', transports: [mockTransport] })
      const child = parent.child('module')

      child.info('Should not log')
      child.warn('Should log')

      expect(entries).toHaveLength(1)
      expect(entries[0]?.level).toBe('warn')
    })

    it('should inherit parent transports', () => {
      const parent = new Logger({ transports: [mockTransport] })
      const child = parent.child('module')

      child.info('Test')
      expect(entries).toHaveLength(1)
    })

    it('should create child from logger without namespace', () => {
      const parent = new Logger({ transports: [mockTransport] })
      const child = parent.child('module')

      child.info('Test')
      expect(entries[0]?.namespace).toBe('module')
    })
  })

  describe('multiple transports', () => {
    it('should write to all transports', async () => {
      const entries1: LogEntry[] = []
      const entries2: LogEntry[] = []

      const transport1 = new CustomTransport((entry) => {
        entries1.push(entry)
      })
      const transport2 = new CustomTransport((entry) => {
        entries2.push(entry)
      })

      const logger = new Logger({ transports: [transport1, transport2] })
      logger.info('Test')

      // Wait for async writes
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(entries1).toHaveLength(1)
      expect(entries2).toHaveLength(1)
      expect(entries1[0]?.message).toBe('Test')
      expect(entries2[0]?.message).toBe('Test')
    })
  })

  describe('error handling', () => {
    let stderrSpy: any

    beforeEach(() => {
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    })

    afterEach(() => {
      stderrSpy.mockRestore()
    })

    it('should handle transport write errors gracefully', async () => {
      const failingTransport = new CustomTransport(async () => {
        throw new Error('Transport failed')
      })

      const logger = new Logger({ transports: [failingTransport] })
      logger.info('Test')

      // Wait for async error handling
      await new Promise<void>((resolve) => setTimeout(resolve, 10))

      // Should have written error to stderr
      expect(stderrSpy).toHaveBeenCalled()
      const errorOutput = stderrSpy.mock.calls[0][0]
      expect(errorOutput).toContain('[neo.logger]')
      expect(errorOutput).toContain('Transport write failed')
    })
  })
})
