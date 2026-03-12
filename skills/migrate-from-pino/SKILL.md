---
name: migrate-from-pino
description: >
  Replace pino with @lpm.dev/neo.logger. Maps pino() to createLogger(),
  pino child logger bindings object to child() string namespace, pino-pretty
  to built-in ConsoleTransport, pino worker thread transports (target string)
  to Transport class instances, and pino serializers to built-in error
  handling. Load when migrating an existing pino codebase.
type: lifecycle
library: neo.logger
library_version: "0.1.0"
requires:
  - getting-started
  - custom-transports
sources:
  - "lpmdev/neo:packages/logger/README.md"
  - "lpmdev/neo:packages/logger/src/core/logger.ts"
  - "lpmdev/neo:packages/logger/src/types.ts"
---

This skill builds on getting-started and custom-transports. Read them first.

# @lpm.dev/neo.logger — Migrate from Pino

## Setup

Replace your pino initialization:

```typescript
// Before (pino)
import pino from 'pino'

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
})
```

```typescript
// After (neo.logger) — pretty console is built-in, no extra dependency
import { createLogger, ConsoleTransport } from '@lpm.dev/neo.logger'

const logger = createLogger({
  level: 'info',
  transports: [new ConsoleTransport({ colors: true })]
})
```

Remove `pino-pretty` from your dependencies — neo.logger includes colored console output via `ConsoleTransport`.

## Core Patterns

### Map pino child loggers

```typescript
// Pino — child accepts bindings object
const child = logger.child({ module: 'database', requestId: 'abc-123' })
child.info('Connected')
// {"level":30,"module":"database","requestId":"abc-123","msg":"Connected"}

// Neo.logger — child accepts a string namespace
const child = logger.child('database')
child.info('Connected', { requestId: 'abc-123' })
// 2026-03-10T10:30:45.123Z INFO  [database] Connected {"requestId":"abc-123"}
```

Pino merges bindings into every log entry. Neo.logger uses string namespaces for grouping. Pass per-request data as structured data in each log call.

### Map pino file transport

```typescript
// Pino
const logger = pino({
  transport: {
    targets: [
      { target: 'pino/file', options: { destination: '/var/log/app.log' } },
      { target: 'pino-pretty', options: { colorize: true } }
    ]
  }
})

// Neo.logger
import { createLogger, ConsoleTransport, FileTransport } from '@lpm.dev/neo.logger'

const logger = createLogger({
  transports: [
    new ConsoleTransport({ colors: true }),
    new FileTransport({ path: '/var/log/app.log', format: 'json', rotate: true })
  ]
})
```

### Map pino error logging

```typescript
// Pino — uses err serializer
const err = new Error('Connection refused')
logger.error({ err }, 'Database failed')

// Neo.logger — Error is the second argument
logger.error('Database failed', new Error('Connection refused'))

// With additional context
logger.error('Database failed', new Error('Connection refused'), { host: 'localhost' })
```

## Common Mistakes

### CRITICAL Using pino child logger with bindings object

Wrong:

```typescript
const child = logger.child({ module: 'database', requestId: '123' })
// TypeError or unexpected behavior — child() expects a string
```

Correct:

```typescript
const child = logger.child('database')
child.info('Query executed', { requestId: '123' })
```

Pino's `child()` accepts an object of key-value bindings merged into every log entry. Neo.logger's `child()` accepts only a string namespace. Per-request context must be passed as structured data in each log call.

Source: src/core/logger.ts:176

### HIGH Expecting pino-style serializers configuration

Wrong:

```typescript
const logger = createLogger({
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req
  }
})
```

Correct:

```typescript
const logger = createLogger({ level: 'info' })

// Error serialization is built-in
logger.error('Failed', new Error('something broke'))
// Automatically includes error name, message, and stack trace

// For request serialization, pass structured data
logger.info('Request', { method: req.method, url: req.url, status: res.statusCode })
```

Neo.logger has no configurable serializers. Error objects are automatically serialized (name, message, stack) when passed to `logger.error()`. For other objects, extract the fields you need into structured data.

Source: src/types.ts:22-29

### HIGH Using pino worker thread transport pattern

Wrong:

```typescript
const logger = createLogger({
  transport: {
    targets: [
      { target: 'pino/file', options: { destination: 'app.log' } }
    ]
  }
})
```

Correct:

```typescript
import { createLogger, FileTransport } from '@lpm.dev/neo.logger'

const logger = createLogger({
  transports: [
    new FileTransport({ path: 'app.log', format: 'json' })
  ]
})
```

Pino uses worker threads and string-based `target` references. Neo.logger uses a simple `transports` array of class instances — no worker threads, no target resolution. The `transport` key (singular) does not exist on `LoggerOptions`.

Source: src/types.ts:28

See also: getting-started/SKILL.md — for child logger namespace patterns
See also: custom-transports/SKILL.md — for Transport interface details
