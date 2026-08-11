---
name: getting-started
description: How to import, configure, and use neo.logger — default logger, createLogger, child loggers, log levels, and transports
version: "1.0.0"
globs:
  - "**/*.ts"
  - "**/*.js"
  - "**/*.tsx"
  - "**/*.jsx"
---

# Getting Started with @lpm.dev/neo.logger

## Import Patterns

### Default logger (quick start)

```typescript
import logger from '@lpm.dev/neo.logger'

logger.info('Server started', { port: 3000 })
logger.warn('High memory', { usage: '85%' })
logger.error('DB failed', new Error('Connection refused'))
```

The default logger uses `INFO` level and `ConsoleTransport`. It reads `LOG_LEVEL` from `process.env` once at import time.

### Custom logger (recommended for production)

```typescript
import { createLogger, ConsoleTransport, FileTransport, parseLevel } from '@lpm.dev/neo.logger'

const logger = createLogger({
  level: parseLevel(process.env.LOG_LEVEL ?? 'info'),
  namespace: 'api',
  transports: [
    new ConsoleTransport(),
    new FileTransport({ path: 'app.log', format: 'json', rotate: true })
  ]
})
```

Always use `createLogger()` when you need file logging, custom transports, or a namespace.

## Log Levels

Five levels in order of severity:

| Level | Value | Use for |
|-------|-------|---------|
| `debug` | 0 | Detailed diagnostic info |
| `info` | 1 | General operational messages |
| `warn` | 2 | Non-critical issues, deprecations |
| `error` | 3 | Failures requiring attention |
| `silent` | 4 | Suppress all output |

```typescript
import { LogLevel, LogLevelName } from '@lpm.dev/neo.logger'

logger.setLevel('debug')   // Show everything
logger.setLevel('warn')    // Only warn + error
logger.setLevel('silent')  // Suppress all

const current = logger.getLevel()
console.log(LogLevelName[current]) // 'info'
```

Level strings are case-insensitive and can have surrounding whitespace. Invalid strings and numeric values outside `0`–`4` throw `RangeError` immediately.

## Child Loggers

Create namespaced loggers that inherit parent config (level + transports):

```typescript
const logger = createLogger({ namespace: 'app' })
const dbLogger = logger.child('database')
const redisLogger = dbLogger.child('redis')

dbLogger.info('Connected')      // [app:database] Connected
redisLogger.debug('Cache hit')  // [app:database:redis] Cache hit
```

Child loggers share the parent's transports and live level state. Calling `setLevel()` on the root, a child, a sibling, or a descendant updates the entire logger family.

## Logging with Data

```typescript
// Structured data as second argument
logger.info('User action', { userId: 123, action: 'purchase' })
logger.error('Request failed', { requestId: 'req-123' })

// Error with context — Error object second, data third
logger.error('Payment failed', new Error('Stripe timeout'), {
  orderId: 'abc',
  amount: 99.99
})

// Serialized and cross-realm errors are accepted when they include a stack or Error-like name
logger.error('Worker failed', {
  name: 'TypeError',
  message: 'Invalid worker response',
  stack: 'TypeError: Invalid worker response\n    at worker.js:1:1'
})
```

## Transports

### ConsoleTransport

```typescript
new ConsoleTransport({
  stderr: true,  // warn/error go to stderr (default: true)
  colors: true   // ANSI colors (default: auto-detect TTY)
})
```

### FileTransport

```typescript
new FileTransport({
  path: 'app.log',
  format: 'json',              // 'json' or 'text'
  rotate: true,                // Enable rotation (default: false)
  maxSize: 10 * 1024 * 1024,   // 10MB (default)
  maxFiles: 5,                 // Keep 5 backups (default)
  mode: 0o600,                 // Creation permissions (default)
  followSymlinks: false        // Reject final path symlinks (default)
})
```

`maxSize` must be a positive safe integer. `maxFiles` must be an integer from 1 through 10,000. Invalid values throw during construction.

### CustomTransport

```typescript
import { CustomTransport } from '@lpm.dev/neo.logger'

new CustomTransport(async (entry) => {
  await fetch('https://logs.example.com', {
    method: 'POST',
    body: JSON.stringify(entry)
  })
})
```

### Multiple transports

```typescript
const logger = createLogger({
  transports: [
    new ConsoleTransport(),
    new FileTransport({ path: 'app.log', format: 'json' }),
    new CustomTransport(sendToDatadog)
  ]
})
```

All transports receive every log entry that passes the logger's level filter. There is no per-transport level filtering.

## Environment Configuration

```bash
# Set via environment variable (read once at import for default logger)
LOG_LEVEL=debug node app.js
LOG_LEVEL=silent node app.js  # suppress all
```

For custom loggers, pass the level explicitly:

```typescript
import { createLogger, parseLevel } from '@lpm.dev/neo.logger'

const logger = createLogger({
  level: parseLevel(process.env.LOG_LEVEL ?? 'info')
})
```
