---
name: anti-patterns
description: Common mistakes when using neo.logger — error() overload confusion, delivery flushing, queue saturation, cross-realm errors, and arg order pitfalls
version: "1.0.0"
globs:
  - "**/*.ts"
  - "**/*.js"
---

# Anti-Patterns for @lpm.dev/neo.logger

### [CRITICAL] Passing a serialized error without error evidence

Wrong:

```typescript
logger.error('Request failed', { message: 'timeout', code: 'ETIMEOUT' })
```

Correct:

```typescript
logger.error('Request failed', {
  name: 'TimeoutError',
  message: 'timeout',
  stack: 'TimeoutError: timeout\n    at request.js:1:1'
})
```

Plain objects are valid structured data for `error()`. To identify a serialized object as an error, include a string `message` plus a string `stack` or a `name` that ends in `Error`. Native and cross-realm `Error` instances are detected automatically.

Source: `src/utils/error.ts` — conservative error-like detection

### [CRITICAL] Sending secrets to transports without redaction

Wrong:

```typescript
logger.info('Login request', { password, authorization, cookie })
```

Correct:

```typescript
const logger = createLogger({ redact: true })
logger.info('Login request', { password, authorization, cookie })
```

Use custom wildcard paths for application-specific PII. Redaction snapshots `entry.data` before any transport sees it. It cannot remove a credential embedded directly in a message or Error.

### [CRITICAL] Assuming logs are delivered before process.exit()

Wrong:

```typescript
logger.error('Fatal error', error)
process.exit(1)  // pending transport writes are abandoned
```

Correct:

```typescript
logger.error('Fatal error', error)
try {
  await logger.close()
} finally {
  process.exit(1)
}
```

Log methods enqueue asynchronous writes and return `void`. `flush()` waits for accepted writes. `close()` also releases transport resources.

An immediate process exit can abandon pending entries.

Source: `src/core/logger.ts` — ordered transport queue and delivery lifecycle

### [HIGH] Dropping error identity during serialization

Wrong:

```typescript
// Deserialized object has no stack or Error-like name
const errorFromWorker = await receiveFromWorker()
logger.error('Worker failed', errorFromWorker)
// { message, code } is intentionally treated as structured data
```

Correct:

```typescript
const errorFromWorker = await receiveFromWorker()
logger.error('Worker failed', {
  name: errorFromWorker.name || 'WorkerError',
  message: errorFromWorker.message,
  stack: errorFromWorker.stack || `WorkerError: ${errorFromWorker.message}`
})
```

Cross-realm `Error` instances work without conversion. Deserialization can discard the prototype and non-enumerable error fields.

Preserve `name`, `message`, and `stack` when you send errors across a serialization boundary.

Source: `src/utils/error.ts` — cross-realm and serialized error recognition

### [HIGH] Using CustomTransport with slow async operations under load

Wrong:

```typescript
const transport = new CustomTransport(async (entry) => {
  await fetch('https://logs.example.com', {
    method: 'POST',
    body: JSON.stringify(entry)
  })
})
// Under sustained load, the bounded queue can fill and drop newest entries
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

Each transport has a bounded ordered queue. The default limit is 10,000 pending writes.

When the queue is full, the logger drops new entries and `flush()` rejects. Use local transports for sustained high-throughput logging.

Source: `src/core/logger.ts` — `maxQueueSize`, `overflowStrategy`, and `flush()`

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

### [MEDIUM] Assuming child logger levels are independent

Wrong:

```typescript
const parent = createLogger({ level: 'info', namespace: 'app' })
const child = parent.child('db')

parent.setLevel('debug')
child.setLevel('warn')
parent.debug('query details')  // NOT logged — the shared level is now WARN
```

Correct:

```typescript
const parent = createLogger({ level: 'info', namespace: 'app' })
const child = parent.child('db')

parent.setLevel('debug')
child.debug('query details')  // logged because the family level is DEBUG
```

The root, children, siblings, and descendants share one live level. Calling `setLevel()` on any member updates the entire family.

If a component needs a different level, create an independent root logger.

Source: `src/core/logger.ts` — shared `LevelState`

### [MEDIUM] Passing an unchecked environment level directly

Wrong:

```typescript
const logger = createLogger({ level: process.env.LOG_LEVEL as 'info' })
```

Correct:

```typescript
import { createLogger, parseLevel } from '@lpm.dev/neo.logger'

const logger = createLogger({
  level: parseLevel(process.env.LOG_LEVEL ?? 'info')
})
```

`LoggerOptions.level` only accepts known level literals. Use `parseLevel()` at dynamic configuration boundaries.

The function trims and normalizes valid strings. It throws `RangeError` for invalid input.

Source: `src/core/level.ts` — strict parsing and validation
