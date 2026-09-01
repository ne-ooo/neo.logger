import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runInNewContext } from 'node:vm'
import { Logger } from '../../src/core/logger.js'
import { LogLevel } from '../../src/core/level.js'
import { CustomTransport } from '../../src/core/transport.js'
import type { ErrorLike, LogEntry, LogLevelInput } from '../../src/types.js'

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

    it('should reject invalid levels instead of silently changing them', () => {
      expect(() => new Logger({ level: 'verbose' as LogLevelInput })).toThrow(RangeError)
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
      logger.error('Failed', { code: 'ERR001' })

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

    it('should preserve data when an optional error is undefined', () => {
      const logger = new Logger({ transports: [mockTransport] })

      logger.error('Failed', undefined, { code: 'ERR001' })

      expect(entries[0]?.error).toBeUndefined()
      expect(entries[0]?.data).toEqual({ code: 'ERR001' })
    })

    it('should recognize cross-realm Error instances', () => {
      const logger = new Logger({ transports: [mockTransport] })
      const error = runInNewContext('new TypeError("Cross-realm failure")') as ErrorLike

      logger.error('Failed', error)

      expect(entries[0]?.error).toBe(error)
      expect(entries[0]?.data).toBeUndefined()
    })

    it('should recognize serialized error-like objects', () => {
      const logger = new Logger({ transports: [mockTransport] })
      const error = {
        name: 'TypeError',
        message: 'Serialized failure',
        stack: 'TypeError: Serialized failure\n    at worker.js:1:1',
      }

      logger.error('Failed', error, { jobId: 42 })

      expect(entries[0]?.error).toBe(error)
      expect(entries[0]?.data).toEqual({ jobId: 42 })
    })

    it('should keep ordinary data with a message field as structured data', () => {
      const logger = new Logger({ transports: [mockTransport] })
      const data = { message: 'Displayed to the user', code: 'NOTICE' }

      logger.error('Request failed', data)

      expect(entries[0]?.data).toBe(data)
      expect(entries[0]?.error).toBeUndefined()
    })

    it('should classify hostile cyclic-prototype values without traversing their prototype', () => {
      let prototypeTrapCalls = 0
      let hostileValue: object
      hostileValue = new Proxy(
        {},
        {
          getPrototypeOf() {
            prototypeTrapCalls += 1
            return hostileValue
          },
        },
      )
      const logger = new Logger({ transports: [mockTransport] })

      expect(() => logger.error('Failed', hostileValue)).not.toThrow()
      expect(entries[0]?.data === hostileValue).toBe(true)
      expect(entries[0]?.error).toBeUndefined()
      expect(prototypeTrapCalls).toBe(0)
    })

    it('should not invoke accessors while classifying serialized Error-like values', () => {
      let getterCalls = 0
      const value = { name: 'MetadataError' } as Record<string, unknown>
      Object.defineProperty(value, 'message', {
        enumerable: true,
        get() {
          getterCalls += 1
          return 'spoofed failure'
        },
      })
      const logger = new Logger({ transports: [mockTransport] })

      logger.error('Failed', value)

      expect(entries[0]?.data === value).toBe(true)
      expect(entries[0]?.error).toBeUndefined()
      expect(getterCalls).toBe(0)
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

    it('should preserve the current level when a new level is invalid', () => {
      const logger = new Logger({ level: 'warn', transports: [mockTransport] })

      expect(() => logger.setLevel('verbose' as LogLevelInput)).toThrow(RangeError)
      expect(logger.getLevel()).toBe(LogLevel.WARN)
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

    it('should apply parent level changes to existing children', () => {
      const parent = new Logger({ level: 'info', transports: [mockTransport] })
      const child = parent.child('module')

      parent.setLevel('debug')
      child.debug('Should log')

      expect(child.getLevel()).toBe(LogLevel.DEBUG)
      expect(entries).toHaveLength(1)
    })

    it('should apply child level changes to the root, siblings, and descendants', () => {
      const root = new Logger({ level: 'info', transports: [mockTransport] })
      const first = root.child('first')
      const sibling = root.child('sibling')
      const descendant = first.child('descendant')

      first.setLevel('debug')
      root.debug('root')
      sibling.debug('sibling')
      descendant.debug('descendant')

      expect(root.getLevel()).toBe(LogLevel.DEBUG)
      expect(sibling.getLevel()).toBe(LogLevel.DEBUG)
      expect(descendant.getLevel()).toBe(LogLevel.DEBUG)
      expect(entries.map((entry) => entry.message)).toEqual(['root', 'sibling', 'descendant'])
    })

    it('should keep independently created logger levels isolated', () => {
      const first = new Logger({ level: 'info', transports: [mockTransport] })
      const second = new Logger({ level: 'warn', transports: [mockTransport] })

      first.setLevel('debug')

      expect(first.getLevel()).toBe(LogLevel.DEBUG)
      expect(second.getLevel()).toBe(LogLevel.WARN)
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

    it('should isolate synchronous transport failures and continue other transports', async () => {
      const goodEntries: LogEntry[] = []
      const throwingTransport = {
        write() {
          throw new Error('Synchronous failure')
        },
      }
      const goodTransport = new CustomTransport((entry) => {
        goodEntries.push(entry)
      })
      const logger = new Logger({ transports: [throwingTransport, goodTransport] })

      expect(() => logger.info('Test')).not.toThrow()
      await expect(logger.flush()).rejects.toThrow('transport writes failed')
      expect(goodEntries).toHaveLength(1)
    })

    it('should handle non-Error promise rejections without an unhandled rejection', async () => {
      const transport = new CustomTransport(async () => {
        throw null
      })
      const logger = new Logger({ transports: [transport] })

      logger.info('Test')

      await expect(logger.flush()).rejects.toThrow('transport writes failed')
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('null'))
    })

    it('should escape control characters in transport diagnostics', async () => {
      const transport = new CustomTransport(async () => {
        throw new Error('failed\nFORGED\x1b[2J')
      })
      const logger = new Logger({ transports: [transport] })

      logger.info('Test')
      await expect(logger.flush()).rejects.toThrow('transport writes failed')

      const diagnostic = String(stderrSpy.mock.calls[0]?.[0]).trimEnd()
      expect(diagnostic.split('\n')).toHaveLength(1)
      expect(diagnostic).toContain('\\n')
      expect(diagnostic).toContain('\\u001b')
      expect(diagnostic).not.toContain('\x1b')
    })
  })

  describe('delivery lifecycle', () => {
    it('should preserve order for asynchronous transports and flush all writes', async () => {
      const messages: string[] = []
      const transport = new CustomTransport(async (entry: LogEntry) => {
        await new Promise((resolve) => setTimeout(resolve, entry.message === 'first' ? 20 : 0))
        messages.push(entry.message)
      })
      const logger = new Logger({ transports: [transport] })

      logger.info('first')
      logger.info('second')
      await logger.flush()

      expect(messages).toEqual(['first', 'second'])
    })

    it('should use bounded batches for transports that support them', async () => {
      let release: (() => void) | undefined
      const firstBatchGate = new Promise<void>((resolve) => {
        release = resolve
      })
      const batches: string[][] = []
      const transport = {
        write: vi.fn(),
        writeBatch: vi.fn((batch: readonly LogEntry[]) => {
          batches.push(batch.map((entry) => entry.message))
          return batches.length === 1 ? firstBatchGate : undefined
        }),
      }
      const logger = new Logger({ transports: [transport] })

      logger.info('first')
      for (let index = 0; index < 600; index += 1) {
        logger.info(`queued-${String(index)}`)
      }
      release?.()
      await logger.flush()

      expect(batches.map((batch) => batch.length)).toEqual([1, 256, 256, 88])
      expect(batches.flat()).toEqual([
        'first',
        ...Array.from({ length: 600 }, (_, index) => `queued-${String(index)}`),
      ])
      expect(transport.write).not.toHaveBeenCalled()
    })

    it('should share transport ordering across child loggers', async () => {
      const namespaces: Array<string | undefined> = []
      const transport = new CustomTransport(async (entry: LogEntry) => {
        await new Promise((resolve) => setTimeout(resolve, entry.namespace?.endsWith(':a') ? 20 : 0))
        namespaces.push(entry.namespace)
      })
      const root = new Logger({ namespace: 'root', transports: [transport] })

      root.child('a').info('first')
      root.child('b').info('second')
      await root.flush()

      expect(namespaces).toEqual(['root:a', 'root:b'])
    })

    it('should bound pending writes and report dropped entries through flush', async () => {
      let release: (() => void) | undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const messages: string[] = []
      const transport = new CustomTransport(async (entry: LogEntry) => {
        messages.push(entry.message)
        await gate
      })
      const logger = new Logger({ transports: [transport], maxQueueSize: 2 })

      logger.info('first')
      logger.info('second')
      logger.info('dropped')
      const flushed = logger.flush()
      release?.()

      await expect(flushed).rejects.toThrow('transport writes failed')
      expect(messages).toEqual(['first', 'second'])
    })

    it('should flush and close transport lifecycle hooks exactly once', async () => {
      const calls: string[] = []
      const transport = {
        async write() {
          await new Promise((resolve) => setTimeout(resolve, 5))
          calls.push('write')
        },
        flush() {
          calls.push('flush')
        },
        close() {
          calls.push('close')
        },
      }
      const logger = new Logger({ transports: [transport] })

      logger.info('Test')
      await logger.close()
      await logger.close()

      expect(calls).toEqual(['write', 'flush', 'close'])
    })

    it('should validate the queue limit', () => {
      expect(() => new Logger({ maxQueueSize: 0 })).toThrow(RangeError)
      expect(() => new Logger({ maxQueueSize: 1.5 })).toThrow(RangeError)
    })
  })

  describe('redaction', () => {
    it('should redact common secrets before transports receive the entry', () => {
      const redactedEntries: LogEntry[] = []
      const logger = new Logger({
        redact: true,
        transports: [
          new CustomTransport((entry) => {
            redactedEntries.push(entry)
          }),
        ],
      })
      const data: Record<string, any> = {
        user: { password: 'hunter2', name: 'Ada' },
        headers: { Authorization: 'Bearer token', cookie: 'sid=secret' },
      }
      data.self = data

      logger.info('Request', data)

      const result = redactedEntries[0]?.data
      expect(result?.user).toEqual({ password: '[REDACTED]', name: 'Ada' })
      expect(result?.headers.Authorization).toBe('[REDACTED]')
      expect(result?.headers.cookie).toBe('[REDACTED]')
      expect(result?.self).toBe('[Circular]')
      expect(result).not.toBe(data)
      expect(data.user.password).toBe('hunter2')
    })

    it('should support wildcard paths and a custom censor', () => {
      const redactedEntries: LogEntry[] = []
      const logger = new Logger({
        redact: {
          paths: ['users.*.ssn', 'payment.**.cardNumber'],
          censor: '<hidden>',
        },
        transports: [
          new CustomTransport((entry) => {
            redactedEntries.push(entry)
          }),
        ],
      })

      logger.info('Request', {
        users: [{ name: 'Ada', ssn: '111-22-3333' }],
        payment: { details: { cardNumber: '4111111111111111' } },
      })

      expect(redactedEntries[0]?.data?.users[0].ssn).toBe('<hidden>')
      expect(redactedEntries[0]?.data?.payment.details.cardNumber).toBe('<hidden>')
    })

    it('should match multiple recursive wildcards without recursive backtracking', () => {
      const redactedEntries: LogEntry[] = []
      const logger = new Logger({
        redact: ['**.*.**.*.**.password'],
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })
      const data: Record<string, any> = {}
      let current = data
      for (let index = 0; index < 50; index += 1) {
        current.child = {}
        current = current.child
      }
      current.password = 'secret'

      logger.info('Request', data)

      let result = redactedEntries[0]?.data
      for (let index = 0; index < 50; index += 1) {
        result = result?.child
      }
      expect(result?.password).toBe('[REDACTED]')
    })

    it('should stop broad redaction snapshots with one size marker', () => {
      const redactedEntries: LogEntry[] = []
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })
      const data = Object.fromEntries(
        Array.from({ length: 20_000 }, (_, index) => [`value${String(index)}`, index]),
      )

      logger.info('Request', data)

      expect(redactedEntries[0]?.data).toEqual({
        value: '[Redaction size limit reached]',
      })
    })

    it('should preserve bounded Array length and reject oversized sparse redaction data', () => {
      const redactedEntries: LogEntry[] = []
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })
      const bounded = new Array(3) as unknown[]
      bounded[0] = 'first'
      const sparse: unknown[] = []
      sparse[10_000_000] = 'last'

      logger.info('Request', { bounded, sparse })

      expect(redactedEntries[0]?.data?.bounded).toHaveLength(3)
      expect(redactedEntries[0]?.data?.bounded[0]).toBe('first')
      expect(redactedEntries[0]?.data?.sparse).toBe('[Redaction size limit reached]')
    })

    it('should retain Array inspection markers at the failing index', () => {
      let indexDescriptorCalls = 0
      const hostileArray = new Proxy(['secret'], {
        getOwnPropertyDescriptor(target, key) {
          if (key === '0') {
            indexDescriptorCalls += 1
            if (indexDescriptorCalls === 2) {
              throw new Error('descriptor revoked')
            }
          }
          return Reflect.getOwnPropertyDescriptor(target, key)
        },
      })
      const redactedEntries: LogEntry[] = []
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })

      logger.info('Request', { values: hostileArray })

      expect(redactedEntries[0]?.data?.values[0]).toBe('[Unable to inspect object safely]')
      expect(JSON.stringify(redactedEntries[0]?.data?.values)).toContain(
        '[Unable to inspect object safely]',
      )
    })

    it('should clone aliases for each path and replace cycles with a safe marker', () => {
      const redactedEntries: LogEntry[] = []
      const logger = new Logger({
        redact: ['private.password'],
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })
      const shared: Record<string, any> = { password: 'secret', value: 'visible' }
      shared.self = shared

      logger.info('Request', { public: shared, private: shared })

      const result = redactedEntries[0]?.data
      expect(result?.public.password).toBe('secret')
      expect(result?.private.password).toBe('[REDACTED]')
      expect(result?.public).not.toBe(result?.private)
      expect(result?.public.self).toBe('[Circular]')
      expect(result?.private.self).toBe('[Circular]')
    })

    it('should preserve native Error fields and redact enumerable metadata without getters', () => {
      const redactedEntries: LogEntry[] = []
      let getterCalls = 0
      const cause = new Error('root cause')
      const error = new TypeError('outer failure', { cause }) as TypeError &
        Record<string, unknown>
      error.code = 'E_OUTER'
      error.token = 'secret'
      Object.defineProperty(error, 'computed', {
        enumerable: true,
        get() {
          getterCalls += 1
          return 'sensitive'
        },
      })
      const logger = new Logger({
        redact: ['failure.token'],
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })

      logger.info('Request', { failure: error })

      const result = redactedEntries[0]?.data?.failure as TypeError & Record<string, unknown>
      expect(Object.getPrototypeOf(result)).toBeNull()
      expect(result).not.toBe(error)
      expect(result.name).toBe('TypeError')
      expect(result.message).toBe('outer failure')
      expect(result.stack).toBe(error.stack)
      expect(Object.getPrototypeOf(result.cause as object)).toBeNull()
      expect((result.cause as Error).message).toBe('root cause')
      expect(result.cause).not.toBe(cause)
      expect(result.code).toBe('E_OUTER')
      expect(result.token).toBe('[REDACTED]')
      expect(result.computed).toBe('[Accessor]')
      expect(getterCalls).toBe(0)
    })

    it('should preserve metadata after enumerable native Error core fields', () => {
      const redactedEntries: LogEntry[] = []
      const error = new Error('boom') as Error & Record<string, unknown>
      error.name = 'CustomError'
      error.code = 'E_CUSTOM'
      error.detail = 'keep me'
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })

      logger.info('Request', { failure: error })

      expect(redactedEntries[0]?.data?.failure).toMatchObject({
        name: 'CustomError',
        message: 'boom',
        code: 'E_CUSTOM',
        detail: 'keep me',
      })
    })

    it('should not invoke hostile native Error core accessors during redaction', () => {
      const redactedEntries: LogEntry[] = []
      const accessorCalls: string[] = []
      const error = new Error('safe')
      for (const key of ['name', 'message', 'stack', 'cause']) {
        Object.defineProperty(error, key, {
          enumerable: true,
          get() {
            accessorCalls.push(key)
            return `attacker-${key}`
          },
        })
      }
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })

      logger.info('Request', { failure: error })

      expect(redactedEntries[0]?.data?.failure).toMatchObject({
        name: '[Accessor]',
        message: '[Accessor]',
        stack: '[Accessor]',
        cause: '[Accessor]',
      })
      expect(accessorCalls).toEqual([])
    })

    it('should not invoke a changed Error.prepareStackTrace hook during redaction', () => {
      const errorConstructor = Error as ErrorConstructor & {
        prepareStackTrace?: (error: Error, callSites: unknown[]) => unknown
      }
      const originalPrepareStackTrace = errorConstructor.prepareStackTrace
      let prepareStackTraceCalls = 0
      errorConstructor.prepareStackTrace = () => {
        prepareStackTraceCalls += 1
        return 'attacker-controlled stack'
      }
      const redactedEntries: LogEntry[] = []
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })

      try {
        logger.info('Request', { failure: new Error('safe') })

        expect(redactedEntries[0]?.data?.failure.stack).toBe('[Accessor]')
        expect(prepareStackTraceCalls).toBe(0)
      } finally {
        if (originalPrepareStackTrace === undefined) {
          Reflect.deleteProperty(errorConstructor, 'prepareStackTrace')
        } else {
          errorConstructor.prepareStackTrace = originalPrepareStackTrace
        }
      }
    })

    it('should not invoke a cross-realm Error.prepareStackTrace hook during redaction', () => {
      const realm = { calls: 0 }
      const error = runInNewContext(
        `
          Error.prepareStackTrace = () => {
            calls += 1
            return 'cross-realm controlled stack'
          }
          new Error('cross-realm failure')
        `,
        realm,
      ) as Error
      const redactedEntries: LogEntry[] = []
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })

      logger.info('Request', { failure: error })

      expect(redactedEntries[0]?.data?.failure.message).toBe('cross-realm failure')
      expect(redactedEntries[0]?.data?.failure.stack).toBe('[Accessor]')
      expect(realm.calls).toBe(0)
    })

    it('should not traverse Proxy boundaries in native Error prototypes during redaction', () => {
      const trapCalls: string[] = []
      const proxyPrototype = new Proxy(Error.prototype, {
        getOwnPropertyDescriptor(target, key) {
          trapCalls.push(`getOwnPropertyDescriptor:${String(key)}`)
          return Reflect.getOwnPropertyDescriptor(target, key)
        },
        getPrototypeOf(target) {
          trapCalls.push('getPrototypeOf')
          return Reflect.getPrototypeOf(target)
        },
      })
      const error = new Error('safe')
      Object.setPrototypeOf(error, proxyPrototype)
      const redactedEntries: LogEntry[] = []
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })

      logger.info('Request', { failure: error })

      expect(redactedEntries[0]?.data?.failure.message).toBe('safe')
      expect(redactedEntries[0]?.data?.failure.stack).toBe('[Accessor]')
      expect(trapCalls).toEqual([])
    })

    it('should not expose inherited Error metadata through the cloned prototype', () => {
      class SecretError extends Error {}
      Object.defineProperty(SecretError.prototype, 'token', {
        value: 'inherited-secret',
        enumerable: true,
      })
      const redactedEntries: LogEntry[] = []
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })

      logger.info('Request', { failure: new SecretError('failed') })

      const result = redactedEntries[0]?.data?.failure
      expect(Object.getPrototypeOf(result)).toBeNull()
      expect(result.token).toBeUndefined()
      expect(result.message).toBe('failed')
    })

    it('should not invoke hostile prototype traps while classifying built-in values', () => {
      const redactedEntries: LogEntry[] = []
      let prototypeTrapCalls = 0
      const hostileValue = new Proxy(
        {},
        {
          getPrototypeOf() {
            prototypeTrapCalls += 1
            throw new Error('prototype trap invoked')
          },
        },
      )
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })

      expect(() => logger.info('Request', { hostileValue })).not.toThrow()
      expect(redactedEntries[0]?.data?.hostileValue === hostileValue).toBe(false)
      expect(prototypeTrapCalls).toBe(0)
    })

    it('should stop traversing cyclic Error prototype chains', () => {
      const redactedEntries: LogEntry[] = []
      const error = new Error('hostile prototype')
      let cyclicPrototype: object
      cyclicPrototype = new Proxy(Object.create(null) as object, {
        getPrototypeOf() {
          return cyclicPrototype
        },
      })
      Object.setPrototypeOf(error, cyclicPrototype)
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })

      expect(() => logger.info('Request', { error })).not.toThrow()
      expect(redactedEntries[0]?.data?.error.message).toBe('hostile prototype')
    })

    it('should clone built-ins without invoking overridden data accessors', () => {
      const redactedEntries: LogEntry[] = []
      let accessorCalls = 0
      const date = new Date('2026-01-02T03:04:05.000Z')
      Object.defineProperty(date, 'getTime', {
        get() {
          accessorCalls += 1
          return Date.prototype.getTime
        },
      })
      const expression = /secret/giu
      Object.defineProperty(expression, 'source', {
        get() {
          accessorCalls += 1
          return 'leaked'
        },
      })
      const logger = new Logger({
        redact: true,
        transports: [new CustomTransport((entry) => redactedEntries.push(entry))],
      })

      logger.info('Request', { date, expression })

      expect(redactedEntries[0]?.data?.date.toISOString()).toBe('2026-01-02T03:04:05.000Z')
      expect(redactedEntries[0]?.data?.expression.source).toBe('secret')
      expect(redactedEntries[0]?.data?.expression.flags).toBe('giu')
      expect(accessorCalls).toBe(0)
    })

    it('should not inspect redacted data when every transport queue drops it', async () => {
      let release: (() => void) | undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const transport = new CustomTransport(async () => {
        await gate
      })
      const logger = new Logger({ redact: true, transports: [transport], maxQueueSize: 1 })
      let inspections = 0
      const droppedData = new Proxy(
        { password: 'secret' },
        {
          ownKeys(target) {
            inspections += 1
            return Reflect.ownKeys(target)
          },
        },
      )

      logger.info('accepted', { safe: true })
      logger.info('dropped', droppedData)
      const flushed = logger.flush()
      release?.()

      await expect(flushed).rejects.toThrow('transport writes failed')
      expect(inspections).toBe(0)
    })

    it('should create one redacted snapshot while preserving duplicate transports', () => {
      const redactedEntries: LogEntry[] = []
      const transport = new CustomTransport((entry) => redactedEntries.push(entry))
      let inspections = 0
      const data = new Proxy(
        { password: 'secret' },
        {
          ownKeys(target) {
            inspections += 1
            return Reflect.ownKeys(target)
          },
        },
      )
      const logger = new Logger({
        redact: true,
        transports: [transport, transport],
        maxQueueSize: 1,
      })

      logger.info('Request', data)

      expect(redactedEntries).toHaveLength(2)
      expect(redactedEntries[0]?.data).toBe(redactedEntries[1]?.data)
      expect(redactedEntries[0]?.data?.password).toBe('[REDACTED]')
      expect(inspections).toBe(1)
    })

    it('should inherit redaction in child loggers without invoking sensitive getters', () => {
      const redactedEntries: LogEntry[] = []
      let getterCalls = 0
      const data = { safe: 'value' } as Record<string, any>
      Object.defineProperty(data, 'secret', {
        enumerable: true,
        get() {
          getterCalls += 1
          return 'sensitive'
        },
      })
      const root = new Logger({
        redact: true,
        transports: [
          new CustomTransport((entry) => {
            redactedEntries.push(entry)
          }),
        ],
      })

      root.child('worker').info('Request', data)

      expect(redactedEntries[0]?.data).toEqual({ safe: 'value', secret: '[REDACTED]' })
      expect(getterCalls).toBe(0)
    })
  })
})
