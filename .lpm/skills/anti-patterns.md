---
name: anti-patterns
description: Common mistakes when using neo.logger — error() overload confusion, fire-and-forget assumptions, cross-realm errors, and arg order pitfalls
version: "1.0.0"
globs:
  - "**/*.ts"
  - "**/*.js"
---

# Anti-Patterns for @lpm.dev/neo.logger

### [CRITICAL] Passing a plain object to error() instead of an Error instance

Wrong:

```typescript
logger.error('Request failed', { message: 'timeout', code: 'ETIMEOUT' })
```

Correct:

```typescript
logger.error('Request failed', new Error('timeout'), { code: 'ETIMEOUT' })
```

The `error()` method uses `instanceof Error` to disambiguate the second argument. A plain object silently becomes `entry.data` instead of `entry.error` — no stack trace is logged, and the error structure is lost in JSON output. There is no type error or runtime warning.

Source: `src/core/logger.ts:90-116` — runtime instanceof check

### [CRITICAL] Assuming logs are delivered before process.exit()

Wrong:

```typescript
logger.error('Fatal error', error)
process.exit(1)  // pending transport writes are abandoned
```

Correct:

```typescript
logger.error('Fatal error', error)
// Use a timeout to give transports a chance to flush
setTimeout(() => process.exit(1), 100)
```

Transport `write()` calls are fire-and-forget with no flush mechanism. `logger.error()` returns `void` synchronously — the actual I/O is an untracked promise. Exiting immediately after logging loses the entry.

Source: `src/core/logger.ts:148-156` — fire-and-forget `.catch()` pattern

### [HIGH] Cross-realm or deserialized errors bypass instanceof check

Wrong:

```typescript
// Error from a worker thread, structuredClone, or JSON.parse
const errorFromWorker = await receiveFromWorker()
logger.error('Worker failed', errorFromWorker)
// errorFromWorker is a plain object — lands in entry.data, not entry.error
```

Correct:

```typescript
const errorFromWorker = await receiveFromWorker()
const realError = new Error(errorFromWorker.message)
realError.stack = errorFromWorker.stack
logger.error('Worker failed', realError, { originalCode: errorFromWorker.code })
```

`instanceof Error` returns false for errors from different V8 contexts (workers, vm modules), `structuredClone()` results, or parsed JSON. These silently become data objects.

Source: `src/core/logger.ts:95` — `instanceof Error` check, maintainer interview

### [HIGH] Using CustomTransport with slow async operations under load

Wrong:

```typescript
const transport = new CustomTransport(async (entry) => {
  await fetch('https://logs.example.com', {
    method: 'POST',
    body: JSON.stringify(entry)
  })
})
// Under 10k logs/sec, promises accumulate unbounded
```

Correct:

```typescript
// Use local transports for high-throughput, ship logs externally via sidecar
const logger = createLogger({
  transports: [
    new FileTransport({ path: 'app.log', format: 'json', rotate: true })
  ]
})
// Then: fluentd/vector/filebeat reads app.log and ships to your log service
```

There is no backpressure, queue, or batching. Each `logger.info()` call spawns an untracked promise per transport. Slow transports cause unbounded promise accumulation leading to OOM under sustained load.

Source: `src/core/logger.ts:148-156` — no backpressure in write loop, maintainer interview

### [HIGH] Expecting pino-style argument order (data first, message second)

Wrong:

```typescript
// Pino style — data first
logger.info({ reqId: '123', method: 'GET' }, 'request started')
```

Correct:

```typescript
// neo.logger style — message first, data second
logger.info('request started', { reqId: '123', method: 'GET' })
```

neo.logger uses `(message, data)` order. Passing an object as the first argument calls `JSON.stringify` on it for the message field, producing `[object Object]` in the output. No error is thrown.

Source: `src/core/logger.ts:44-66` — method signatures, maintainer interview

### [MEDIUM] Expecting setLevel() on parent to affect existing children

Wrong:

```typescript
const parent = createLogger({ level: 'info', namespace: 'app' })
const child = parent.child('db')

parent.setLevel('debug')
child.debug('query details')  // NOT logged — child still has INFO level
```

Correct:

```typescript
const parent = createLogger({ level: 'info', namespace: 'app' })
const child = parent.child('db')

parent.setLevel('debug')
child.setLevel('debug')  // must set on each child separately
child.debug('query details')  // now logged
```

`child()` creates a new `Logger` instance with a copy of the parent's level at creation time. The parent and child have independent level state.

Source: `src/core/logger.ts:176-184` — child creates new Logger with spread options

### [MEDIUM] Relying on invalid level strings to throw errors

Wrong:

```typescript
const logger = createLogger({ level: process.env.LOG_LEVEL })
// If LOG_LEVEL="verbose" (not a valid level), silently defaults to INFO
```

Correct:

```typescript
const validLevels = ['debug', 'info', 'warn', 'error', 'silent']
const level = process.env.LOG_LEVEL || 'info'
if (!validLevels.includes(level)) {
  throw new Error(`Invalid LOG_LEVEL: ${level}`)
}
const logger = createLogger({ level })
```

`parseLevel()` returns `LogLevel.INFO` for any unrecognized string. A typo like `LOG_LEVEL=debu` or `LOG_LEVEL=verbose` silently falls back to INFO with no warning.

Source: `src/core/level.ts:43-58` — default case returns INFO
