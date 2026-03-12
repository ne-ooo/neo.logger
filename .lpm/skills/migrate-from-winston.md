---
name: migrate-from-winston
description: Step-by-step guide for migrating from winston to neo.logger — transport mapping, format pipeline removal, API differences, and feature gap table
version: "1.0.0"
globs:
  - "**/*.ts"
  - "**/*.js"
---

# Migrate from Winston to @lpm.dev/neo.logger

## Quick Comparison

| Aspect | winston | neo.logger |
|--------|---------|------------|
| Dependencies | ~30 transitive | Zero |
| Bundle size | ~50KB | ~12KB |
| Format system | Pipeline (`combine`, `printf`, `json`) | Two built-in formatters (console, JSON) |
| Per-transport levels | Yes (`level: 'error'` per transport) | No — all transports get all entries passing logger level |
| Exception handling | `handleExceptions`, `handleRejections` | Not built-in |
| Log querying | `logger.query()` | Not available |
| Profiling | `logger.profile()`, `startTimer()` | Not available — use `performance.now()` |
| Stream API | `logger.stream()` | Not available |
| Default metadata | `defaultMeta` | Use `namespace` for context |
| TypeScript | Via `@types/winston` | Native, first-class |

## Step 1: Replace Imports

```typescript
// Before
import winston from 'winston'

// After
import { createLogger, ConsoleTransport, FileTransport } from '@lpm.dev/neo.logger'
```

## Step 2: Migrate Logger Creation

### Basic logger

```typescript
// Winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'app.log' })
  ]
})

// neo.logger — no format pipeline, JSON format is per-transport
const logger = createLogger({
  level: 'info',
  transports: [
    new ConsoleTransport(),
    new FileTransport({ path: 'app.log', format: 'json' })
  ]
})
```

### With defaultMeta

```typescript
// Winston
const logger = winston.createLogger({
  defaultMeta: { service: 'api' }
})

// neo.logger — use namespace (closest equivalent)
const logger = createLogger({ namespace: 'api' })
// Logs appear as: [api] Message here
```

`namespace` only adds a single string label. If you need arbitrary metadata on every log entry, pass it explicitly or wrap in a helper.

### With error-only file transport

```typescript
// Winston — per-transport level filtering
const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  ]
})

// neo.logger — no per-transport levels
// Option 1: Use CustomTransport to filter
import { CustomTransport } from '@lpm.dev/neo.logger'
import { appendFile } from 'node:fs/promises'

const errorFileTransport = new CustomTransport(async (entry) => {
  if (entry.level === 'error') {
    await appendFile('error.log', JSON.stringify(entry) + '\n')
  }
})

const logger = createLogger({
  transports: [
    new ConsoleTransport(),
    new FileTransport({ path: 'app.log', format: 'json' }),
    errorFileTransport
  ]
})
```

## Step 3: Migrate Log Calls

### Basic logging (identical)

```typescript
// Winston
logger.info('Server started', { port: 3000 })
logger.warn('High memory')

// neo.logger — same API
logger.info('Server started', { port: 3000 })
logger.warn('High memory')
```

### Error logging (different)

```typescript
// Winston — error object in metadata
logger.error('Failed', { error: err, userId: 123 })

// neo.logger — Error as second argument, data as third
logger.error('Failed', err, { userId: 123 })

// Or without an Error object, just data
logger.error('Failed', { userId: 123 })
```

### Child loggers

```typescript
// Winston
const child = logger.child({ module: 'db' })

// neo.logger — namespace-based children
const child = logger.child('db')
child.info('Connected')  // [app:db] Connected
```

## Step 4: Handle Missing Features

### No format pipeline

Winston's `format.combine()`, `format.printf()`, `format.colorize()` have no equivalent. neo.logger has two built-in formatters:

- `ConsoleTransport` — pretty, colored output (auto-detects TTY)
- `FileTransport({ format: 'json' })` — structured JSON

If you need custom formatting, use `CustomTransport` with `formatConsole()` or `formatJSON()`:

```typescript
import { CustomTransport, formatJSON } from '@lpm.dev/neo.logger'

const customFormat = new CustomTransport((entry) => {
  const json = JSON.parse(formatJSON(entry))
  json.env = process.env.NODE_ENV
  process.stdout.write(JSON.stringify(json) + '\n')
})
```

### No exception/rejection handlers

```typescript
// Winston
const logger = winston.createLogger({ handleExceptions: true })

// neo.logger — handle manually
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err)
  setTimeout(() => process.exit(1), 100)  // give transports time to write
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)))
})
```

### No profiling

```typescript
// Winston
logger.profile('request')
// ... work ...
logger.profile('request')  // logs duration

// neo.logger — use performance.now()
const start = performance.now()
// ... work ...
logger.info('Request completed', { duration: Math.round(performance.now() - start) })
```

### No silent mode toggle

```typescript
// Winston
logger.silent = true

// neo.logger
logger.setLevel('silent')
```

## Migration Checklist

- [ ] Replace `winston` imports with `@lpm.dev/neo.logger`
- [ ] Rewrite `winston.createLogger()` to `createLogger()` with explicit transports
- [ ] Remove `format.combine()` pipelines — use built-in formatters
- [ ] Change `error()` calls to pass Error object as second arg
- [ ] Replace `defaultMeta` with `namespace`
- [ ] Replace per-transport `level` with CustomTransport filtering if needed
- [ ] Add manual `uncaughtException`/`unhandledRejection` handlers if using `handleExceptions`
- [ ] Replace `logger.profile()` with `performance.now()` timing
- [ ] Remove `@types/winston` from devDependencies
