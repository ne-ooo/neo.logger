---
name: migrate-from-pino
description: Step-by-step guide for migrating from pino to neo.logger — reversed argument order, no worker threads, no pino.final(), transport simplification
version: "1.0.0"
globs:
  - "**/*.ts"
  - "**/*.js"
---

# Migrate from Pino to @lpm.dev/neo.logger

## Quick Comparison

| Aspect | pino | neo.logger |
|--------|------|------------|
| Dependencies | ~10 | Zero |
| Transport architecture | Worker threads (off main thread) | Async on main thread (fire-and-forget) |
| Pretty printing | Requires `pino-pretty` package | Built-in via ConsoleTransport |
| Argument order | `(data, message)` | `(message, data)` |
| Flush on exit | `pino.final()` | No flush mechanism |
| Backpressure | Worker queue with limits | None — unbounded |
| Custom transports | Separate module in worker | Inline function, same process |
| Serializers | `serializers` option | Not available — format data before passing |
| Redaction | `redact` paths | Not available — sanitize data before logging |
| Startup overhead | ~50ms (worker thread init) | Zero |

## Step 1: Replace Imports

```typescript
// Before
import pino from 'pino'

// After
import { createLogger, ConsoleTransport, FileTransport } from '@lpm.dev/neo.logger'
```

## Step 2: Migrate Logger Creation

### Basic logger

```typescript
// Pino
const logger = pino({ level: 'info' })

// neo.logger
const logger = createLogger({ level: 'info' })
```

### With pretty printing

```typescript
// Pino — requires pino-pretty dependency
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
})

// neo.logger — pretty console is built-in, no extra dependency
const logger = createLogger({
  transports: [new ConsoleTransport({ colors: true })]
})
```

### With file output

```typescript
// Pino — uses pino.destination() or transport targets
const logger = pino(pino.destination('app.log'))

// Or with transport
const logger = pino({
  transport: {
    target: 'pino/file',
    options: { destination: 'app.log' }
  }
})

// neo.logger
const logger = createLogger({
  transports: [
    new ConsoleTransport(),
    new FileTransport({ path: 'app.log', format: 'json', rotate: true })
  ]
})
```

### With child loggers

```typescript
// Pino — child with bindings (merged into every entry)
const child = logger.child({ module: 'db', version: '2.1' })

// neo.logger — child with namespace (string label only)
const child = logger.child('db')
// Output: [app:db] message

// If you need extra fields on every log, wrap in a helper:
function createModuleLogger(parent, name, meta) {
  const child = parent.child(name)
  const origInfo = child.info.bind(child)
  child.info = (msg, data) => origInfo(msg, { ...meta, ...data })
  return child
}
```

## Step 3: Fix Argument Order (Critical)

This is the #1 migration stumble. Pino and neo.logger use **reversed argument order**.

```typescript
// Pino — data FIRST, message SECOND
logger.info({ reqId: '123', method: 'GET' }, 'request started')

// neo.logger — message FIRST, data SECOND
logger.info('request started', { reqId: '123', method: 'GET' })
```

If you accidentally use pino order, the object becomes the message string (`[object Object]`). No error is thrown.

### Error logging

```typescript
// Pino — error as a property in the data object
logger.error({ err: error, reqId: '123' }, 'request failed')

// neo.logger — Error as second argument, data as third
logger.error('request failed', error, { reqId: '123' })
```

## Step 4: Handle Missing Features

### No pino.final() — flush on exit

```typescript
// Pino
const handler = pino.final(logger, (err, finalLogger) => {
  finalLogger.error('fatal error', err)
  process.exit(1)
})
process.on('uncaughtException', handler)

// neo.logger — no flush guarantee, use timeout
process.on('uncaughtException', (err) => {
  logger.error('Fatal error', err)
  setTimeout(() => process.exit(1), 100)
})
```

There is no `logger.flush()` or `logger.close()`. Transport writes are fire-and-forget. On process exit, pending writes may be lost.

### No serializers

```typescript
// Pino
const logger = pino({
  serializers: {
    req: pino.stdSerializers.req,
    err: pino.stdSerializers.err
  }
})
logger.info({ req }, 'incoming request')

// neo.logger — serialize manually before logging
logger.info('incoming request', {
  method: req.method,
  url: req.url,
  headers: req.headers
})
```

### No redaction

```typescript
// Pino
const logger = pino({
  redact: ['req.headers.authorization', 'user.password']
})

// neo.logger — sanitize data before passing
function sanitize(data) {
  const clean = { ...data }
  if (clean.authorization) clean.authorization = '[REDACTED]'
  if (clean.password) clean.password = '[REDACTED]'
  return clean
}

logger.info('User login', sanitize(userData))
```

### No multistream

```typescript
// Pino — multistream for multiple outputs
const streams = [
  { stream: process.stdout },
  { stream: pino.destination('app.log') },
  { level: 'error', stream: pino.destination('error.log') }
]
const logger = pino({ level: 'debug' }, pino.multistream(streams))

// neo.logger — multiple transports natively (but no per-transport levels)
import { CustomTransport } from '@lpm.dev/neo.logger'
import { appendFile } from 'node:fs/promises'

const logger = createLogger({
  level: 'debug',
  transports: [
    new ConsoleTransport(),
    new FileTransport({ path: 'app.log', format: 'json' }),
    new CustomTransport(async (entry) => {
      if (entry.level === 'error') {
        await appendFile('error.log', JSON.stringify(entry) + '\n')
      }
    })
  ]
})
```

## Architecture Difference: No Worker Threads

Pino offloads serialization and I/O to a worker thread — `logger.info()` costs nanoseconds on the main thread. neo.logger runs formatting synchronously on the main thread, then fires async I/O.

| | pino | neo.logger |
|--|------|------------|
| Main thread cost | ~nanoseconds | Microseconds (format + serialize) |
| Under I/O pressure | Worker absorbs it | Main thread feels it |
| Transport crash | Worker crash isolated | Error swallowed to stderr |
| Memory under load | Worker queue bounded | Unbounded promise accumulation |

For most applications, neo.logger's throughput (8M ops/sec) is more than sufficient. The difference matters at extreme scale (100k+ logs/sec) or with slow custom transports.

## Migration Checklist

- [ ] Replace `pino` imports with `@lpm.dev/neo.logger`
- [ ] **Reverse all argument order**: `(data, msg)` to `(msg, data)`
- [ ] Replace `pino({ transport: { target: 'pino-pretty' }})` with `new ConsoleTransport()`
- [ ] Replace `pino.destination()` with `FileTransport`
- [ ] Replace `logger.child({ key: value })` with `logger.child('name')`
- [ ] Remove `pino.final()` — add manual exit handlers with timeout
- [ ] Remove `serializers` — serialize data before logging
- [ ] Remove `redact` — sanitize data before logging
- [ ] Remove `pino-pretty` from dependencies
- [ ] Remove `pino` from dependencies
