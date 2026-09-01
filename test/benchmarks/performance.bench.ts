import { afterAll, bench, describe } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import {
  createLogger,
  CustomTransport,
  FileTransport,
  formatConsole,
  formatJSON,
  rotateFiles,
} from '../../src/index.js'
import type { LogEntry, Transport } from '../../src/index.js'

class NoOpStream extends Writable {
  _write(_chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    callback()
  }
}

const synchronousSink = new NoOpStream()
const synchronousLogger = createLogger({
  transports: [
    new CustomTransport((entry) => {
      synchronousSink.write(formatJSON(entry) + '\n')
    }),
  ],
})

const structuredData = {
  userId: 123,
  action: 'login',
  request: {
    method: 'POST',
    path: '/api/users',
  },
}

function createDeepData(depth: number): Record<string, any> {
  const result: Record<string, any> = {}
  let current = result
  for (let index = 0; index < depth; index += 1) {
    current.child = { index }
    current = current.child
  }
  current.password = 'secret'
  return result
}

describe('Completed synchronous delivery', () => {
  bench('simple JSON entry to a no-op stream', () => {
    synchronousLogger.info('Test message')
  })

  bench('structured JSON entry to a no-op stream', () => {
    synchronousLogger.info('User action', structuredData)
  })
})

describe('neo.logger hot paths', () => {
  const filteredLogger = createLogger({ level: 'silent', transports: [] })
  const defaultRedactionLogger = createLogger({
    redact: true,
    transports: [new CustomTransport(() => undefined)],
  })
  const multiGlobstarRedactionLogger = createLogger({
    redact: ['**.*.**.*.**.password'],
    transports: [new CustomTransport(() => undefined)],
  })
  const deepData = createDeepData(50)
  const entry: LogEntry = {
    timestamp: 1_705_318_245_123,
    level: 'info',
    message: 'User action',
    namespace: 'api',
    data: structuredData,
  }

  bench('filtered entry', () => {
    filteredLogger.info('Filtered', structuredData)
  })

  bench('safe JSON formatter', () => {
    formatJSON(entry)
  })

  bench('text formatter without colors', () => {
    formatConsole(entry, { colors: false })
  })

  bench('default redaction of structured data', () => {
    defaultRedactionLogger.info('User action', structuredData)
  })

  bench('iterative multi-globstar redaction of deep data', () => {
    multiGlobstarRedactionLogger.info('Deep data', deepData)
  })
})

describe('Overload hot path', () => {
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const saturatedLogger = createLogger({
    redact: true,
    maxQueueSize: 1,
    transports: [new CustomTransport(async () => gate)],
  })
  const droppedData = createDeepData(50)
  saturatedLogger.info('accepted', structuredData)

  afterAll(async () => {
    release?.()
    await saturatedLogger.flush().catch(() => undefined)
    await saturatedLogger.close()
  })

  bench('drop from a saturated queue without redaction traversal', () => {
    saturatedLogger.info('dropped', droppedData)
  })
})

describe('Sparse rotation', () => {
  const rotationDirectory = mkdtempSync(join(tmpdir(), 'neo-logger-rotation-benchmark-'))
  const rotationPath = join(rotationDirectory, 'app.log')

  afterAll(() => {
    rmSync(rotationDirectory, { recursive: true, force: true })
  })

  bench(
    'rotate with 10000 configured slots and no existing backups',
    async () => {
      await writeFile(rotationPath, 'entry')
      await rotateFiles(rotationPath, 10_000)
      await unlink(`${rotationPath}.1`)
    },
    { time: 500, iterations: 10 },
  )
})

describe('Completed asynchronous delivery', () => {
  const batchTransport: Transport = {
    write() {},
    async writeBatch() {
      await Promise.resolve()
    },
  }
  const batchLogger = createLogger({ transports: [batchTransport] })

  const benchmarkDirectory = mkdtempSync(join(tmpdir(), 'neo-logger-benchmark-'))
  const fileLogger = createLogger({
    transports: [new FileTransport({ path: join(benchmarkDirectory, 'app.log') })],
  })
  const unbatchedFileTransport = new FileTransport({
    path: join(benchmarkDirectory, 'unbatched.log'),
  })
  const unbatchedFileLogger = createLogger({
    transports: [{ write: (entry) => unbatchedFileTransport.write(entry) }],
  })
  const rotatingUnbatchedFileTransport = new FileTransport({
    path: join(benchmarkDirectory, 'rotating-unbatched.log'),
    rotate: true,
    maxSize: 1_000_000_000,
  })
  const rotatingUnbatchedFileLogger = createLogger({
    transports: [{ write: (entry) => rotatingUnbatchedFileTransport.write(entry) }],
  })

  afterAll(async () => {
    await Promise.all([
      batchLogger.close(),
      fileLogger.close(),
      unbatchedFileLogger.close(),
      rotatingUnbatchedFileLogger.close(),
    ])
    rmSync(benchmarkDirectory, { recursive: true, force: true })
  })

  bench(
    '100 entries through an asynchronous batch transport and flush',
    async () => {
      for (let index = 0; index < 100; index += 1) {
        batchLogger.info('Message', { index })
      }
      await batchLogger.flush()
    },
    { time: 500, iterations: 10 },
  )

  bench(
    '100 JSON entries to a file and flush',
    async () => {
      for (let index = 0; index < 100; index += 1) {
        fileLogger.info('Message', { index })
      }
      await fileLogger.flush()
    },
    { time: 500, iterations: 10 },
  )

  bench(
    '100 JSON entries without batching and flush',
    async () => {
      for (let index = 0; index < 100; index += 1) {
        unbatchedFileLogger.info('Message', { index })
      }
      await unbatchedFileLogger.flush()
    },
    { time: 500, iterations: 10 },
  )

  bench(
    '100 JSON entries without batching, with rotation below threshold, and flush',
    async () => {
      for (let index = 0; index < 100; index += 1) {
        rotatingUnbatchedFileLogger.info('Message', { index })
      }
      await rotatingUnbatchedFileLogger.flush()
    },
    { time: 500, iterations: 10 },
  )
})
