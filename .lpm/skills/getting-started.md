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
import { createLogger, ConsoleTransport, FileTransport } from '@lpm.dev/neo.logger'

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
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

Invalid level strings silently default to `INFO` — no error is thrown.

## Child Loggers

Create namespaced loggers that inherit parent config (level + transports):

```typescript
const logger = createLogger({ namespace: 'app' })
const dbLogger = logger.child('database')
const redisLogger = dbLogger.child('redis')

dbLogger.info('Connected')      // [app:database] Connected
redisLogger.debug('Cache hit')  // [app:database:redis] Cache hit
```

Child loggers share the parent's transport array by reference. Changing the parent's level after creation does not affect existing children.

## Logging with Data

```typescript
// Structured data as second argument
logger.info('User action', { userId: 123, action: 'purchase' })

// Error with context — Error object second, data third
logger.error('Payment failed', new Error('Stripe timeout'), {
  orderId: 'abc',
  amount: 99.99
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
  maxFiles: 5                  // Keep 5 backups (default)
})
```

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
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info'
})
```
