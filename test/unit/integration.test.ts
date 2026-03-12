import { describe, it, expect } from 'vitest'
import { createLogger, CustomTransport } from '../../src/index.js'
import type { LogEntry } from '../../src/index.js'

describe('createLogger', () => {
  it('returns a Logger instance with default options', () => {
    const logger = createLogger()
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.child).toBe('function')
    expect(typeof logger.setLevel).toBe('function')
    expect(typeof logger.getLevel).toBe('function')
  })

  it('accepts options and passes them to Logger', () => {
    const entries: LogEntry[] = []
    const transport = new CustomTransport((e) => { entries.push(e) })
    const logger = createLogger({ level: 'debug', namespace: 'myapp', transports: [transport] })

    logger.debug('hello')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.level).toBe('debug')
    expect(entries[0]?.namespace).toBe('myapp')
  })

  it('each call returns a new independent instance', () => {
    const entries1: LogEntry[] = []
    const entries2: LogEntry[] = []

    const logger1 = createLogger({ transports: [new CustomTransport((e) => entries1.push(e))] })
    const logger2 = createLogger({ transports: [new CustomTransport((e) => entries2.push(e))] })

    logger1.info('from logger1')
    expect(entries1).toHaveLength(1)
    expect(entries2).toHaveLength(0)

    logger2.info('from logger2')
    expect(entries1).toHaveLength(1)
    expect(entries2).toHaveLength(1)
  })
})

describe('concurrent writes', () => {
  it('all concurrent messages reach the transport', async () => {
    const entries: LogEntry[] = []
    const transport = new CustomTransport(async (e) => {
      // Simulate slight async delay
      await new Promise((r) => setTimeout(r, 1))
      entries.push(e)
    })

    const logger = createLogger({ transports: [transport] })

    // Fire 20 logs without awaiting
    for (let i = 0; i < 20; i++) {
      logger.info(`message ${i}`, { i })
    }

    // Allow all async transport writes to complete
    await new Promise((r) => setTimeout(r, 100))

    expect(entries).toHaveLength(20)
    const messages = entries.map((e) => e.message)
    for (let i = 0; i < 20; i++) {
      expect(messages).toContain(`message ${i}`)
    }
  })

  it('concurrent writes from multiple child loggers all land in shared transport', async () => {
    const entries: LogEntry[] = []
    const transport = new CustomTransport((e) => { entries.push(e) })
    const root = createLogger({ namespace: 'root', transports: [transport] })

    const childA = root.child('a')
    const childB = root.child('b')
    const childC = root.child('c')

    childA.info('from a')
    childB.warn('from b')
    childC.error('from c')

    await new Promise((r) => setTimeout(r, 10))

    expect(entries).toHaveLength(3)
    const namespaces = entries.map((e) => e.namespace)
    expect(namespaces).toContain('root:a')
    expect(namespaces).toContain('root:b')
    expect(namespaces).toContain('root:c')
  })

  it('transport errors do not prevent other writes', async () => {
    const good: LogEntry[] = []
    let calls = 0

    const flakyTransport = new CustomTransport(async (e) => {
      calls++
      if (calls % 2 === 0) throw new Error('flaky')
      good.push(e)
    })

    const logger = createLogger({ transports: [flakyTransport] })

    for (let i = 0; i < 6; i++) {
      logger.info(`msg ${i}`)
    }

    await new Promise((r) => setTimeout(r, 50))

    // Even-numbered calls threw, odd succeeded → 3 good entries (calls 1,3,5)
    expect(good).toHaveLength(3)
    // Total calls still happened
    expect(calls).toBe(6)
  })
})

describe('end-to-end log pipeline', () => {
  it('full pipeline: createLogger → child → level change → write', async () => {
    const entries: LogEntry[] = []
    const transport = new CustomTransport((e) => entries.push(e))

    const root = createLogger({ level: 'info', namespace: 'app', transports: [transport] })
    const db = root.child('db')

    // At 'info' level, debug is suppressed
    db.debug('query start')
    expect(entries).toHaveLength(0)

    db.info('connected')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.namespace).toBe('app:db')

    // Dynamically lower level
    db.setLevel('debug')
    db.debug('query executed')

    await new Promise((r) => setTimeout(r, 10))
    expect(entries).toHaveLength(2)
    expect(entries[1]?.level).toBe('debug')
  })

  it('namespace chain: root → mid → leaf', async () => {
    const entries: LogEntry[] = []
    const logger = createLogger({
      namespace: 'svc',
      transports: [new CustomTransport((e) => entries.push(e))],
    })

    const mid = logger.child('controller')
    const leaf = mid.child('handler')

    leaf.warn('404')
    await new Promise((r) => setTimeout(r, 10))
    expect(entries[0]?.namespace).toBe('svc:controller:handler')
  })
})
