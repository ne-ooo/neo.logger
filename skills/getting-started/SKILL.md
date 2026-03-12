---
name: getting-started
description: >
  First-time setup for @lpm.dev/neo.logger. Covers createLogger(), default
  logger export, LogLevel enum, parseLevel(), setLevel(), getLevel(), child()
  loggers, LOG_LEVEL env var, structured data logging, and the error()
  overloaded signature (message, Error?, data?). Load when installing,
  configuring, or using the logger for the first time.
type: lifecycle
library: neo.logger
library_version: "0.1.0"
sources:
  - "lpmdev/neo:packages/logger/src/index.ts"
  - "lpmdev/neo:packages/logger/src/core/logger.ts"
  - "lpmdev/neo:packages/logger/src/core/level.ts"
  - "lpmdev/neo:packages/logger/README.md"
---

# @lpm.dev/neo.logger — Getting Started

## Setup

```typescript
import logger from '@lpm.dev/neo.logger'

logger.info('Server started', { port: 3000 })
logger.warn('High memory usage', { usage: '85%' })
logger.error('Database connection failed', new Error('Connection refused'))
```

The default logger uses `INFO` level and `ConsoleTransport`. Set the level via the `LOG_LEVEL` environment variable:

```bash
LOG_LEVEL=debug node app.js
```

## Core Patterns

### Create a custom logger

```typescript
import { createLogger, ConsoleTransport } from '@lpm.dev/neo.logger'

const logger = createLogger({
  level: 'debug',
  namespace: 'app',
  transports: [new ConsoleTransport({ colors: true })]
})

logger.debug('Initializing', { config: 'loaded' })
// 2026-03-10T10:30:45.123Z DEBUG [app] Initializing {"config":"loaded"}
```

### Create child loggers for modules

```typescript
import { createLogger } from '@lpm.dev/neo.logger'

const logger = createLogger({ namespace: 'app' })
const dbLogger = logger.child('database')
const redisLogger = dbLogger.child('redis')

dbLogger.info('Connected')
// 2026-03-10T10:30:45.123Z INFO  [app:database] Connected

redisLogger.debug('Cache hit', { key: 'user:123' })
// 2026-03-10T10:30:45.124Z DEBUG [app:database:redis] Cache hit {"key":"user:123"}
```

Child loggers inherit the parent's level and transports.

### Log errors with context

```typescript
try {
  await connectToDatabase()
} catch (error) {
  logger.error('Connection failed', error, { host: 'localhost', port: 5432 })
}
```

The `error()` method accepts `(message, error?, data?)`. Pass an `Error` object as the second argument to get stack trace output. Pass structured data as the third argument.

### Change log level at runtime

```typescript
import { LogLevel, LogLevelName } from '@lpm.dev/neo.logger'

logger.setLevel('debug')
const current = logger.getLevel()
console.log(LogLevelName[current]) // 'debug'

// Temporarily increase verbosity
const original = logger.getLevel()
logger.setLevel('debug')
await debugOperation()
logger.setLevel(original)
```

## Common Mistakes

### CRITICAL Misusing logger.error() overloaded signature

Wrong:

```typescript
logger.error('Failed', { code: 'TIMEOUT', message: 'Request timed out' })
// The plain object is treated as data, not an error — no stack trace logged
```

Correct:

```typescript
logger.error('Failed', new Error('Request timed out'), { code: 'TIMEOUT' })
```

The `error()` method checks `instanceof Error` on the second argument. A plain object passes the check as `false` and is silently treated as the `data` parameter instead.

Source: src/core/logger.ts:90-102

### HIGH Using winston-style logger.log() method

Wrong:

```typescript
logger.log('info', 'Server started', { port: 3000 })
// TypeError: logger.log is not a function
```

Correct:

```typescript
logger.info('Server started', { port: 3000 })
```

The `Logger` class has no public `log()` method. Use `debug()`, `info()`, `warn()`, or `error()` directly.

Source: src/core/logger.ts — log() is private

### MEDIUM Invalid log level silently defaults to INFO

Wrong:

```typescript
const logger = createLogger({ level: 'verbose' })
// Silently defaults to INFO — debug messages are suppressed with no warning
```

Correct:

```typescript
const logger = createLogger({ level: 'debug' })
// Valid levels: debug, info, warn, error, silent
```

`parseLevel()` returns `LogLevel.INFO` for any unrecognized string instead of throwing an error.

Source: src/core/level.ts:57

### MEDIUM Expecting logger methods to return Promises

Wrong:

```typescript
await logger.info('Server started', { port: 3000 })
// await does nothing — logger.info() returns void, not Promise
```

Correct:

```typescript
logger.info('Server started', { port: 3000 })
// Fire and forget — transport errors are written to stderr
```

The `debug()`, `info()`, and `warn()` methods return `void`. Transport writes are fire-and-forget internally. Transport errors are caught and written to `process.stderr`.

Source: src/core/logger.ts:148-156

See also: custom-transports/SKILL.md — for configuring where logs are delivered
See also: go-to-production/SKILL.md — for production readiness checklist
