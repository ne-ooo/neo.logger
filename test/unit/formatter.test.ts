import { describe, it, expect } from 'vitest'
import { runInNewContext } from 'node:vm'
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

  it('should fall back to the message when a serialized Error has an empty stack', () => {
    const result = formatConsole(
      {
        ...baseEntry,
        error: { name: 'TypeError', message: 'inner failure', stack: '' },
      },
      { colors: false },
    )

    expect(result).toContain('  | inner failure')
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

  it('should preserve intrinsic accessor-backed DOMException fields', () => {
    const error = new DOMException('cancelled', 'AbortError')

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(parsed.error.name).toBe('AbortError')
    expect(parsed.error.message).toBe('cancelled')
    expect(parsed.error.stack).toContain('AbortError: cancelled')
  })

  it('should not let intrinsic stack formatting invoke hostile Error accessors', () => {
    let getterCalls = 0
    const error = new Error('original')
    for (const key of ['name', 'message', 'stack']) {
      Object.defineProperty(error, key, {
        get() {
          getterCalls += 1
          return key === 'stack' ? 'Evil: evil' : 'evil'
        },
      })
    }

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(parsed.error.name).toBe('Error')
    expect(parsed.error.message).toBe('Unable to read error message')
    expect(parsed.error.stack).toBe('Unable to read error stack')
    expect(getterCalls).toBe(0)
  })

  it('should not let intrinsic stack formatting coerce hostile core values', () => {
    let coercionCalls = 0
    const error = new Error('original')
    Object.defineProperty(error, 'name', {
      value: {
        toString() {
          coercionCalls += 1
          return 'Evil'
        },
      },
    })

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(parsed.error.name).toBe('Error')
    expect(parsed.error.stack).toBe('Unable to read error stack')
    expect(coercionCalls).toBe(0)
  })

  it('should not invoke a custom global Error.prepareStackTrace callback', () => {
    const errorConstructor = Error as ErrorConstructor & {
      prepareStackTrace?: (error: Error, callSites: unknown[]) => unknown
    }
    const originalPrepareStackTrace = errorConstructor.prepareStackTrace
    let prepareStackTraceCalls = 0
    errorConstructor.prepareStackTrace = () => {
      prepareStackTraceCalls += 1
      return 'attacker-controlled stack'
    }

    try {
      const parsed = JSON.parse(
        formatJSON({ ...baseEntry, level: 'error', error: new Error('safe') }),
      )

      expect(parsed.error.stack).toBe('Unable to read error stack')
      expect(prepareStackTraceCalls).toBe(0)
    } finally {
      if (originalPrepareStackTrace === undefined) {
        Reflect.deleteProperty(errorConstructor, 'prepareStackTrace')
      } else {
        errorConstructor.prepareStackTrace = originalPrepareStackTrace
      }
    }
  })

  it('should not invoke a cross-realm Error.prepareStackTrace callback', () => {
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

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(parsed.error.message).toBe('cross-realm failure')
    expect(parsed.error.stack).toBe('Unable to read error stack')
    expect(realm.calls).toBe(0)
  })

  it('should not traverse Proxy boundaries in native Error prototype chains', () => {
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

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(parsed.error.message).toBe('safe')
    expect(parsed.error.stack).toBe('Unable to read error stack')
    expect(trapCalls).toEqual([])
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

  it('should describe hostile thrown values without prototype traversal', () => {
    let hostileValue: object
    hostileValue = new Proxy(
      {},
      {
        getPrototypeOf() {
          return hostileValue
        },
      },
    )
    const data = Object.create(null) as Record<string, unknown>
    Object.defineProperty(data, 'bad', {
      enumerable: true,
      get() {
        throw hostileValue
      },
    })

    const parsed = JSON.parse(formatJSON({ ...baseEntry, data }))

    expect(parsed.data).toBe('[Unserializable data]')
    expect(parsed.serializationError).toBe('Unknown serialization error')
  })

  it('should preserve the primary error when structured data cannot be serialized', () => {
    const data = Object.create(null) as Record<string, any>
    Object.defineProperty(data, 'bad', {
      enumerable: true,
      get() {
        throw new Error('getter failed')
      },
    })

    const result = formatJSON({
      ...baseEntry,
      level: 'error',
      data,
      error: new Error('database unavailable'),
    })
    const parsed = JSON.parse(result)

    expect(parsed.data).toBe('[Unserializable data]')
    expect(parsed.error.name).toBe('Error')
    expect(parsed.error.message).toBe('database unavailable')
    expect(parsed.error.stack).toContain('Error: database unavailable')
  })

  it('should not read accessors while classifying structured data as Error-like', () => {
    let getterCalls = 0
    const payload = Object.create(null) as Record<string, unknown>
    Object.defineProperty(payload, 'message', {
      get() {
        getterCalls += 1
        return 'spoofed failure'
      },
    })

    const parsed = JSON.parse(formatJSON({ ...baseEntry, data: { payload } }))

    expect(parsed.data.payload).toEqual({})
    expect(getterCalls).toBe(0)
  })

  it('should serialize the primary error independently of a custom toJSON method', () => {
    const error = new Error('controlled failure') as Error & {
      toJSON: () => Record<string, unknown>
    }
    error.toJSON = () => ({ custom: true })

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(parsed.error.name).toBe('Error')
    expect(parsed.error.message).toBe('controlled failure')
    expect(parsed.error.custom).toBeUndefined()
  })

  it('should serialize error causes independently of custom toJSON methods', () => {
    const cause = new Error('controlled cause') as Error & {
      toJSON: () => Record<string, unknown>
    }
    cause.toJSON = () => ({ custom: true })

    const parsed = JSON.parse(
      formatJSON({
        ...baseEntry,
        level: 'error',
        error: new Error('outer failure', { cause }),
      }),
    )

    expect(parsed.error.cause.name).toBe('Error')
    expect(parsed.error.cause.message).toBe('controlled cause')
    expect(parsed.error.cause.custom).toBeUndefined()
  })

  it('should recursively prepare nested Error metadata without invoking toJSON', () => {
    let toJSONCalls = 0
    const nested = new Error('nested failure') as Error & {
      toJSON: () => Record<string, unknown>
    }
    nested.toJSON = () => {
      toJSONCalls += 1
      return { custom: true }
    }
    const error = new Error('outer failure') as Error & Record<string, unknown>
    error.metadata = { nested }

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(parsed.error.metadata.nested.name).toBe('Error')
    expect(parsed.error.metadata.nested.message).toBe('nested failure')
    expect(parsed.error.metadata.nested.custom).toBeUndefined()
    expect(toJSONCalls).toBe(0)
  })

  it('should omit function-valued Error metadata without invoking toJSON', () => {
    let toJSONCalls = 0
    const metadata = Object.assign(() => undefined, {
      toJSON() {
        toJSONCalls += 1
        return { attackerControlled: true }
      },
    })
    const error = new Error('outer failure') as Error & Record<string, unknown>
    error.metadata = metadata

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(parsed.error).not.toHaveProperty('metadata')
    expect(parsed.error).not.toHaveProperty('attackerControlled')
    expect(toJSONCalls).toBe(0)
  })

  it('should snapshot Error metadata accessors without invoking them', () => {
    let getterCalls = 0
    const metadata = { name: 'MetadataError' } as Record<string, unknown>
    Object.defineProperty(metadata, 'message', {
      enumerable: true,
      get() {
        getterCalls += 1
        return 'spoofed failure'
      },
    })
    const error = new Error('outer failure') as Error & Record<string, unknown>
    error.metadata = metadata

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(parsed.error.metadata).toEqual({
      name: 'MetadataError',
      message: '[Accessor]',
    })
    expect(getterCalls).toBe(0)
  })

  it('should contain revoked Error metadata proxies without throwing', () => {
    let revokeProxy: () => void = () => undefined
    const revocable = Proxy.revocable(
      { value: 'visible' },
      {
        ownKeys() {
          return ['value']
        },
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key)
          revokeProxy()
          return descriptor
        },
      },
    )
    revokeProxy = revocable.revoke
    const error = new Error('outer failure') as Error & Record<string, unknown>
    error.metadata = revocable.proxy

    expect(() => formatJSON({ ...baseEntry, level: 'error', error })).not.toThrow()
    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))
    expect(parsed.error.message).toBe('outer failure')
  })

  it('should bound broad Error metadata with one size marker', () => {
    const metadata = Object.fromEntries(
      Array.from({ length: 20_000 }, (_, index) => [`value${String(index)}`, index]),
    )
    const error = new Error('outer failure') as Error & Record<string, unknown>
    error.metadata = metadata

    const result = formatJSON({ ...baseEntry, level: 'error', error })
    const parsed = JSON.parse(result)

    expect(parsed.error.metadata).toBe('[Error size limit reached]')
    expect(result.length).toBeLessThan(10_000)
  })

  it('should bound broad primary Error properties before copying them', () => {
    let toJSONCalls = 0
    const error = new Error('wide failure') as Error & Record<string, unknown>
    for (let index = 0; index < 20_000; index += 1) {
      error[`value${String(index)}`] = index
    }
    error.last = {
      toJSON() {
        toJSONCalls += 1
        return { attackerControlled: true }
      },
    }

    const result = formatJSON({ ...baseEntry, level: 'error', error })
    const parsed = JSON.parse(result)

    expect(parsed.error.serializationTruncated).toBe('[Error size limit reached]')
    expect(parsed.error).not.toHaveProperty('last')
    expect(result.length).toBeLessThan(10_000)
    expect(toJSONCalls).toBe(0)
  })

  it('should not retain raw Error core fields when the shared node budget is exhausted', () => {
    let toJSONCalls = 0
    const nested = new Error('nested', {
      cause: {
        toJSON() {
          toJSONCalls += 1
          return { attackerControlled: true }
        },
      },
    })
    const error = new Error('outer') as Error & Record<string, unknown>
    error.metadata = {
      scalar: 1,
      filler: Array.from({ length: 4_996 }, () => 0),
      nested,
    }

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(JSON.stringify(parsed)).not.toContain('attackerControlled')
    expect(toJSONCalls).toBe(0)
  })

  it('should preserve bounded Array length and reject oversized sparse Error metadata', () => {
    const bounded = new Array(3) as unknown[]
    bounded[0] = 'first'
    const boundedError = new Error('bounded') as Error & Record<string, unknown>
    boundedError.metadata = bounded

    const boundedParsed = JSON.parse(
      formatJSON({ ...baseEntry, level: 'error', error: boundedError }),
    )
    expect(boundedParsed.error.metadata).toEqual(['first', null, null])

    const sparse: unknown[] = []
    sparse[10_000_000] = 'last'
    const sparseError = new Error('sparse') as Error & Record<string, unknown>
    sparseError.metadata = sparse

    const sparseResult = formatJSON({ ...baseEntry, level: 'error', error: sparseError })
    const sparseParsed = JSON.parse(sparseResult)
    expect(sparseParsed.error.metadata).toBe('[Error size limit reached]')
    expect(sparseResult.length).toBeLessThan(10_000)
  })

  it('should mark a primary Error nested in its own metadata as circular', () => {
    const error = new Error('outer failure') as Error & Record<string, unknown>
    error.metadata = { nested: error }

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(parsed.error.metadata.nested).toBe('[Circular Error]')
  })

  it('should bound deeply nested error-cause serialization', () => {
    let error = new Error('root')
    for (let index = 0; index < 100; index += 1) {
      error = new Error(`level-${String(index)}`, { cause: error })
    }

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))
    let cause = parsed.error
    let depth = 0
    while (typeof cause === 'object' && cause !== null) {
      cause = cause.cause
      depth += 1
    }

    expect(depth).toBe(64)
    expect(cause).toBe('[Error depth limit reached]')
  })

  it('should snapshot error metadata without invoking custom toJSON methods', () => {
    let toJSONCalls = 0
    const error = new Error('metadata failure') as Error & Record<string, unknown>
    error.metadata = {
      status: 'preserved',
      toJSON() {
        toJSONCalls += 1
        throw new Error('metadata getter failed')
      },
    }

    const parsed = JSON.parse(formatJSON({ ...baseEntry, level: 'error', error }))

    expect(parsed).not.toHaveProperty('data')
    expect(parsed.error.message).toBe('metadata failure')
    expect(parsed.error.metadata.status).toBe('preserved')
    expect(parsed).not.toHaveProperty('serializationError')
    expect(toJSONCalls).toBe(0)
  })

  it('should serialize repeated non-circular error references normally', () => {
    const error = new Error('shared failure')

    const result = formatJSON({
      ...baseEntry,
      data: { first: error, second: error },
    })
    const parsed = JSON.parse(result)

    expect(parsed.data.first.message).toBe('shared failure')
    expect(parsed.data.second.message).toBe('shared failure')
  })

  it('should mark a recursive error cause as circular', () => {
    const error = new Error('recursive')
    error.cause = error

    const result = formatJSON({ ...baseEntry, level: 'error', error })
    const parsed = JSON.parse(result)

    expect(parsed.error.cause).toBe('[Circular Error]')
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

  it('should preserve null and undefined Error causes exactly', () => {
    const nullCause = JSON.parse(
      formatJSON({
        ...baseEntry,
        error: new Error('null cause', { cause: null }),
      }),
    )
    expect(nullCause.error.cause).toBeNull()

    const undefinedError = new Error('undefined cause', { cause: undefined })
    const undefinedCause = JSON.parse(formatJSON({ ...baseEntry, error: undefinedError }))
    expect(undefinedCause.error).not.toHaveProperty('cause')
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
