---
name: best-practices
description: Production patterns for neo.logger — transport setup, structured logging, environment config, delivery guarantees, and file rotation
version: "1.0.0"
globs:
  - "**/*.ts"
  - "**/*.js"
---

# Best Practices for @lpm.dev/neo.logger

## Always Use createLogger() in Production

The default logger (`import logger from '@lpm.dev/neo.logger'`) only has `ConsoleTransport` and reads `LOG_LEVEL` once at import. For production, always create an explicit logger:

```typescript
import { createLogger, ConsoleTransport, FileTransport } from '@lpm.dev/neo.logger'

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  namespace: 'api',
  transports: [
    new ConsoleTransport({ colors: false }),
    new FileTransport({
      path: '/var/log/app.log',
      format: 'json',
      rotate: true,
      maxSize: 10 * 1024 * 1024,
      maxFiles: 5
    })
  ]
})
```

## Use Child Loggers for Module Boundaries

Create one root logger, then derive children per module:

```typescript
// lib/logger.ts
export const logger = createLogger({ namespace: 'app', level: 'info' })

// routes/users.ts
import { logger } from '../lib/logger'
const log = logger.child('users')
log.info('User created', { id: 42 })  // [app:users] User created

// services/db.ts
const log = logger.child('db')
log.warn('Slow query', { ms: 1200 })  // [app:db] Slow query
```

This gives you filterable, structured namespaces in production logs.

## Structured Data Over String Interpolation

```typescript
// Good — structured, machine-parseable
logger.info('Request handled', { method: 'GET', path: '/users', status: 200, duration: 45 })

// Bad — hard to parse, no structured fields
logger.info(`GET /users returned 200 in 45ms`)
```

Structured data appears in `entry.data` and is preserved as-is in JSON format output. String interpolation loses that structure.

## Understand Transport Delivery Guarantees

Transport writes are **fire-and-forget**. The `logger.info()` call returns `void` synchronously — there is no way to await delivery.

```typescript
// This does NOT guarantee the log was written
logger.info('Critical event', { orderId: 'abc' })
process.exit(0)  // pending writes are lost
```

Implications:

- **No flush mechanism** — there is no `logger.flush()` or `logger.close()`
- **Transport errors go to stderr** — printed as `[neo.logger] Transport write failed: ...`
- **Partial delivery is normal** — if FileTransport fails (disk full), ConsoleTransport still fires
- **No backpressure** — high-volume logging with slow transports (HTTP fetch) accumulates promises in memory

For critical audit trails that must be delivered, write to a database or message queue directly — don't rely solely on logger transports.

## Keep Transports Fast and Local

The best production setup:

1. **ConsoleTransport** + **FileTransport** for local output
2. Ship logs externally via a **sidecar** (fluentd, vector, filebeat) reading the log files

Avoid putting slow HTTP calls in `CustomTransport` for high-throughput paths. Formatting runs on the main thread, and unbounded async writes can cause memory pressure.

## File Rotation Limitations

FileTransport rotation works well for single-process deployments. Be aware:

- **No file locking** — in multi-process setups (PM2 cluster, multiple containers sharing a volume), concurrent rotation can overwrite backups
- **Size check is not atomic** — two processes can both see the file under `maxSize` and both append past it
- For multi-process, use a sidecar log rotator (logrotate) instead of built-in rotation

## Environment-Specific Setup

```typescript
import { createLogger, ConsoleTransport, FileTransport } from '@lpm.dev/neo.logger'

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  namespace: process.env.SERVICE_NAME || 'app',
  transports: [
    new ConsoleTransport({
      colors: process.env.NODE_ENV !== 'production'
    }),
    ...(process.env.NODE_ENV === 'production'
      ? [new FileTransport({ path: '/var/log/app.log', format: 'json', rotate: true })]
      : []
    )
  ]
})
```

## Suppress Logs in Tests

```typescript
import { createLogger } from '@lpm.dev/neo.logger'

const logger = createLogger({ level: 'silent' })
```

Or set the environment variable:

```bash
LOG_LEVEL=silent npx vitest run
```

## Monitor stderr for Transport Failures

In production, watch for `[neo.logger] Transport write failed` messages on stderr. These indicate a transport is failing silently and logs may be lost. Set up alerts on this pattern.
