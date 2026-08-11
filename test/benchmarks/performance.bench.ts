import { afterAll, bench, describe } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import {
  createLogger,
  CustomTransport,
  FileTransport,
  formatConsole,
  formatJSON,
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

  afterAll(async () => {
    await Promise.all([batchLogger.close(), fileLogger.close(), unbatchedFileLogger.close()])
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
})
