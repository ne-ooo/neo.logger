import { bench, describe } from 'vitest'
import { Writable } from 'node:stream'
import winston from 'winston'
import pino from 'pino'
import { createLogger, CustomTransport, ConsoleTransport } from '../../src/index.js'

// Create a no-op writable stream for benchmarking
class NoOpStream extends Writable {
  _write(_chunk: any, _encoding: string, callback: () => void) {
    callback()
  }
}

const noOpStream = new NoOpStream()

// Setup loggers
const neoLogger = createLogger({
  level: 'info',
  transports: [
    new CustomTransport(async () => {
      // No-op transport for benchmarking
    }),
  ],
})

const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Stream({
      stream: noOpStream,
    }),
  ],
})

const pinoLogger = pino(noOpStream)

describe('Logger Performance Comparison', () => {
  describe('Basic Logging', () => {
    bench('neo.logger - simple message', () => {
      neoLogger.info('Test message')
    })

    bench('winston - simple message', () => {
      winstonLogger.info('Test message')
    })

    bench('pino - simple message', () => {
      pinoLogger.info('Test message')
    })
  })

  describe('Logging with Structured Data', () => {
    const data = {
      userId: 123,
      action: 'login',
      timestamp: Date.now(),
      ip: '192.168.1.1',
    }

    bench('neo.logger - with data', () => {
      neoLogger.info('User action', data)
    })

    bench('winston - with data', () => {
      winstonLogger.info('User action', data)
    })

    bench('pino - with data', () => {
      pinoLogger.info(data, 'User action')
    })
  })

  describe('Logging with Complex Data', () => {
    const complexData = {
      user: {
        id: 123,
        name: 'John Doe',
        email: 'john@example.com',
        roles: ['admin', 'user'],
      },
      request: {
        method: 'POST',
        path: '/api/users',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0',
        },
        body: { foo: 'bar', baz: [1, 2, 3] },
      },
      metadata: {
        timestamp: Date.now(),
        duration: 45.678,
        status: 'success',
      },
    }

    bench('neo.logger - complex data', () => {
      neoLogger.info('Complex operation', complexData)
    })

    bench('winston - complex data', () => {
      winstonLogger.info('Complex operation', complexData)
    })

    bench('pino - complex data', () => {
      pinoLogger.info(complexData, 'Complex operation')
    })
  })

  describe('Different Log Levels', () => {
    bench('neo.logger - mixed levels', () => {
      neoLogger.debug('Debug message')
      neoLogger.info('Info message')
      neoLogger.warn('Warn message')
      neoLogger.error('Error message')
    })

    bench('winston - mixed levels', () => {
      winstonLogger.debug('Debug message')
      winstonLogger.info('Info message')
      winstonLogger.warn('Warn message')
      winstonLogger.error('Error message')
    })

    bench('pino - mixed levels', () => {
      pinoLogger.debug('Debug message')
      pinoLogger.info('Info message')
      pinoLogger.warn('Warn message')
      pinoLogger.error('Error message')
    })
  })

  describe('Level Filtering (Disabled Logs)', () => {
    const neoDebugLogger = createLogger({
      level: 'warn',
      transports: [new CustomTransport(async () => {})],
    })

    const winstonDebugLogger = winston.createLogger({
      level: 'warn',
      transports: [
        new winston.transports.Stream({
          stream: noOpStream,
        }),
      ],
    })

    const pinoDebugLogger = pino({ level: 'warn' }, noOpStream)

    bench('neo.logger - filtered debug', () => {
      neoDebugLogger.debug('Should not log')
      neoDebugLogger.info('Should not log')
    })

    bench('winston - filtered debug', () => {
      winstonDebugLogger.debug('Should not log')
      winstonDebugLogger.info('Should not log')
    })

    bench('pino - filtered debug', () => {
      pinoDebugLogger.debug('Should not log')
      pinoDebugLogger.info('Should not log')
    })
  })

  describe('Child Loggers', () => {
    const neoParent = createLogger({
      namespace: 'app',
      transports: [new CustomTransport(async () => {})],
    })
    const neoChild = neoParent.child('module')

    const winstonParent = winston.createLogger({
      defaultMeta: { namespace: 'app' },
      transports: [
        new winston.transports.Stream({
          stream: noOpStream,
        }),
      ],
    })
    const winstonChild = winstonParent.child({ namespace: 'app:module' })

    const pinoParent = pino(noOpStream)
    const pinoChild = pinoParent.child({ namespace: 'app:module' })

    bench('neo.logger - child logger', () => {
      neoChild.info('Child message')
    })

    bench('winston - child logger', () => {
      winstonChild.info('Child message')
    })

    bench('pino - child logger', () => {
      pinoChild.info('Child message')
    })
  })

  describe('Error Logging', () => {
    const error = new Error('Test error')
    error.stack = 'Error: Test error\n    at test (test.ts:42:10)\n    at main (app.ts:15:3)'

    bench('neo.logger - with error', () => {
      neoLogger.error('Operation failed', error)
    })

    bench('winston - with error', () => {
      winstonLogger.error('Operation failed', { error })
    })

    bench('pino - with error', () => {
      pinoLogger.error({ error }, 'Operation failed')
    })
  })

  describe('High-Volume Logging (100 messages)', () => {
    bench('neo.logger - 100 messages', () => {
      for (let i = 0; i < 100; i++) {
        neoLogger.info('Message', { index: i })
      }
    })

    bench('winston - 100 messages', () => {
      for (let i = 0; i < 100; i++) {
        winstonLogger.info('Message', { index: i })
      }
    })

    bench('pino - 100 messages', () => {
      for (let i = 0; i < 100; i++) {
        pinoLogger.info({ index: i }, 'Message')
      }
    })
  })
})

describe('Real-World Scenarios', () => {
  describe('API Request Logging', () => {
    const requestData = {
      method: 'POST',
      path: '/api/users',
      status: 200,
      duration: 45,
      userId: 123,
      ip: '192.168.1.1',
    }

    bench('neo.logger - API request', () => {
      neoLogger.info('Request processed', requestData)
    })

    bench('winston - API request', () => {
      winstonLogger.info('Request processed', requestData)
    })

    bench('pino - API request', () => {
      pinoLogger.info(requestData, 'Request processed')
    })
  })

  describe('Database Query Logging', () => {
    const queryData = {
      query: 'SELECT * FROM users WHERE id = $1',
      params: [123],
      duration: 12.5,
      rows: 1,
    }

    bench('neo.logger - database query', () => {
      neoLogger.debug('Query executed', queryData)
    })

    bench('winston - database query', () => {
      winstonLogger.debug('Query executed', queryData)
    })

    bench('pino - database query', () => {
      pinoLogger.debug(queryData, 'Query executed')
    })
  })

  describe('Worker Job Logging', () => {
    const jobData = {
      jobId: 'job-123',
      type: 'email',
      status: 'completed',
      duration: 1234,
      attempts: 1,
    }

    bench('neo.logger - worker job', () => {
      neoLogger.info('Job completed', jobData)
    })

    bench('winston - worker job', () => {
      winstonLogger.info('Job completed', jobData)
    })

    bench('pino - worker job', () => {
      pinoLogger.info(jobData, 'Job completed')
    })
  })
})

describe('Formatter Performance', () => {
  describe('Console Format', () => {
    const consoleNeo = createLogger({
      transports: [new ConsoleTransport()],
    })

    // Winston with pretty format
    const consoleWinston = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} ${level}: ${message}`
        })
      ),
      transports: [
        new winston.transports.Stream({
          stream: noOpStream,
        }),
      ],
    })

    // Pino doesn't have built-in pretty format (requires pino-pretty)
    // So we'll skip this comparison as it's not fair

    bench('neo.logger - console format', () => {
      consoleNeo.info('Test message', { userId: 123 })
    })

    bench('winston - console format', () => {
      consoleWinston.info('Test message', { userId: 123 })
    })
  })

  describe('JSON Format', () => {
    const jsonNeo = createLogger({
      transports: [new CustomTransport(async () => {})],
    })

    const jsonWinston = winston.createLogger({
      format: winston.format.json(),
      transports: [
        new winston.transports.Stream({
          stream: noOpStream,
        }),
      ],
    })

    const jsonPino = pino(noOpStream)

    bench('neo.logger - JSON format', () => {
      jsonNeo.info('Test message', { userId: 123 })
    })

    bench('winston - JSON format', () => {
      jsonWinston.info('Test message', { userId: 123 })
    })

    bench('pino - JSON format', () => {
      jsonPino.info({ userId: 123 }, 'Test message')
    })
  })
})
