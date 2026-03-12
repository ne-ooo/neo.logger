---
name: migrate-from-winston
description: >
  Replace winston with @lpm.dev/neo.logger. Maps winston.createLogger to
  createLogger(), winston.format.combine/timestamp/json to ConsoleTransport
  and FileTransport, winston.transports.File/Console to neo.logger transports,
  and winston levels (verbose, silly, http) to neo.logger levels (debug, info,
  warn, error, silent). Load when migrating an existing winston codebase.
type: lifecycle
library: neo.logger
library_version: "0.1.0"
requires:
  - getting-started
  - custom-transports
sources:
  - "lpmdev/neo:packages/logger/README.md"
  - "lpmdev/neo:packages/logger/src/core/level.ts"
  - "lpmdev/neo:packages/logger/src/types.ts"
---

This skill builds on getting-started and custom-transports. Read them first.

# @lpm.dev/neo.logger — Migrate from Winston

## Setup

Replace your winston initialization:

```typescript
// Before (winston)
import winston from 'winston'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
})
```

```typescript
// After (neo.logger)
import { createLogger, ConsoleTransport, FileTransport, CustomTransport } from '@lpm.dev/neo.logger'
import { appendFile } from 'node:fs/promises'

const logger = createLogger({
  level: 'info',
  transports: [
    new ConsoleTransport({ colors: false }),
    new CustomTransport(async (entry) => {
      if (entry.level === 'error') {
        await appendFile('error.log', JSON.stringify(entry) + '\n')
      }
    }),
    new FileTransport({ path: 'combined.log', format: 'json' })
  ]
})
```

## Core Patterns

### Map winston log methods

```typescript
// Winston                          // Neo.logger
logger.silly('msg')              // logger.debug('msg')
logger.verbose('msg')            // logger.debug('msg')
logger.http('msg')               // logger.debug('msg')
logger.info('msg')               // logger.info('msg')
logger.warn('msg')               // logger.warn('msg')
logger.error('msg')              // logger.error('msg')
logger.log('info', 'msg')        // logger.info('msg')
```

Winston's `silly`, `verbose`, and `http` levels all map to `debug` in neo.logger.

### Map winston child loggers

```typescript
// Winston
const child = logger.child({ service: 'api', requestId: '123' })

// Neo.logger — namespace is a string, not an object
const child = logger.child('api')
// Pass request-scoped data in each log call
child.info('Request processed', { requestId: '123', duration: 45 })
```

### Map winston meta/splat

```typescript
// Winston — structured data via splat format
logger.info('User %s logged in', userId, { ip: '192.168.1.1' })

// Neo.logger — structured data as second argument
logger.info('User logged in', { userId, ip: '192.168.1.1' })
```

Neo.logger does not support printf-style string interpolation. Use template literals if needed.

## Common Mistakes

### HIGH Using winston format pipeline

Wrong:

```typescript
import { createLogger } from '@lpm.dev/neo.logger'

const logger = createLogger({
  format: combine(timestamp(), json()),
  transports: [new ConsoleTransport()]
})
```

Correct:

```typescript
import { createLogger, ConsoleTransport, FileTransport } from '@lpm.dev/neo.logger'

const logger = createLogger({
  transports: [
    new ConsoleTransport({ colors: true }),
    new FileTransport({ path: 'app.log', format: 'json' })
  ]
})
```

Neo.logger has no format pipeline. Formatting is determined by transport type: `ConsoleTransport` produces pretty output, `FileTransport` with `format: 'json'` produces structured JSON. The `format` key on `LoggerOptions` does not exist and is silently ignored.

Source: src/types.ts:22-29

### HIGH Using winston log levels like verbose or silly

Wrong:

```typescript
logger.setLevel('verbose')
// Silently defaults to INFO — no error thrown
```

Correct:

```typescript
logger.setLevel('debug')
// Valid levels: debug, info, warn, error, silent
```

Neo.logger recognizes only 5 levels. Winston's `verbose`, `silly`, and `http` levels are not recognized and `parseLevel()` silently returns `LogLevel.INFO` for unknown strings.

Source: src/core/level.ts:43-58

### MEDIUM Expecting per-transport level filtering

Wrong:

```typescript
new FileTransport({ path: 'errors.log', level: 'error' })
// 'level' option does not exist on FileTransportOptions
```

Correct:

```typescript
import { CustomTransport } from '@lpm.dev/neo.logger'
import { appendFile } from 'node:fs/promises'

new CustomTransport(async (entry) => {
  if (entry.level === 'error') {
    await appendFile('errors.log', JSON.stringify(entry) + '\n')
  }
})
```

Winston allows a `level` option per transport. Neo.logger has a single level on the Logger instance — all transports receive the same entries. Use a `CustomTransport` wrapper to filter by level.

Source: src/types.ts:52-63

### HIGH Using winston-style logger.log() method

Wrong:

```typescript
logger.log('info', 'Server started', { port: 3000 })
```

Correct:

```typescript
logger.info('Server started', { port: 3000 })
```

Neo.logger has no public `log()` method. Use `debug()`, `info()`, `warn()`, or `error()` directly.

Source: src/core/logger.ts — log() is private

See also: custom-transports/SKILL.md — for transport configuration details
See also: getting-started/SKILL.md — for logger setup fundamentals
