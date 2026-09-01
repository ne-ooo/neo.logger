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

The default logger only has `ConsoleTransport`. It reads `LOG_LEVEL` one time when the module loads.

For production, create an explicit logger:

```typescript
import { createLogger, ConsoleTransport, FileTransport, parseLevel } from '@lpm.dev/neo.logger'

export const logger = createLogger({
  level: parseLevel(process.env.LOG_LEVEL ?? 'info'),
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

All loggers in the family share one live level. A `setLevel()` call on one logger changes the level for the family.

## Structured Data Over String Interpolation

```typescript
// Good — structured, machine-parseable
logger.info('Request handled', { method: 'GET', path: '/users', status: 200, duration: 45 })

// Bad — hard to parse, no structured fields
logger.info(`GET /users returned 200 in 45ms`)
```

Structured data appears in `entry.data` and keeps its shape in JSON output unless redaction is enabled. String interpolation loses that structure.

## Redact Sensitive Structured Data

Use `redact: true` for common secret keys at any depth, or provide paths with `*` and `**` wildcards:

```typescript
const logger = createLogger({
  redact: {
    paths: ['user.password', 'request.headers.authorization', 'payments.*.cardNumber'],
    censor: '<hidden>'
  }
})
```

Redaction occurs before every transport and does not change the source object. Redaction applies only to structured data.

Do not include credentials in a message or error text.

## Understand Transport Delivery Guarantees

Log methods enqueue accepted asynchronous transport writes and return `void`. Use `flush()` or `close()` when delivery must complete.

```typescript
logger.info('Critical event', { orderId: 'abc' })
await logger.flush()
process.exit(0)
```

Implications:

- **Explicit delivery** — `flush()` waits for accepted writes. `close()` also releases transports.
- **Transport errors go to stderr** — printed as `[neo.logger] Transport write failed: ...`
- **Failures are observable** — `flush()` and `close()` reject after a write failure or queue overflow
- **Bounded queues** — each transport permits 10,000 pending writes by default, then drops newest

Custom transports can implement `writeBatch(entries)` for burst delivery. Each batch contains no more than 256 ordered entries.

If a batch fails, `flush()` reports each entry in that batch as a failed write.

For critical audit trails, write to a database or message queue directly. Do not rely only on logger transports.

## Keep Transports Fast and Local

The best production setup:

1. **ConsoleTransport** + **FileTransport** for local output
2. Ship logs externally via a **sidecar** (fluentd, vector, filebeat) reading the log files

Avoid putting slow HTTP calls in `CustomTransport` for high-throughput paths. A slow handler can fill the bounded queue and cause entries to be dropped.

## File Rotation Limitations

FileTransport serializes writes and rotation by resolved path within one process. Be aware:

- New files default to mode `0600`; existing targets cannot be more permissive than `mode`
- POSIX targets must be regular files owned by the effective process user
- Final-component symlinks are rejected unless `followSymlinks: true` is explicit
- `followSymlinks: true` cannot be combined with built-in rotation
- `maxSize` accepts positive safe integers
- `maxFiles` accepts integers from 1 through 10,000
- **No cross-process locking** — PM2 workers or containers sharing a volume can still race
- Do not put log files in directories writable by untrusted users
- For multi-process, use a sidecar log rotator (logrotate) instead of built-in rotation

## Environment-Specific Setup

```typescript
import { createLogger, ConsoleTransport, FileTransport, parseLevel } from '@lpm.dev/neo.logger'

export const logger = createLogger({
  level: parseLevel(process.env.LOG_LEVEL ?? 'info'),
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

In production, monitor stderr for `[neo.logger] Transport write failed`. This message identifies a transport failure, and log entries can be lost.

Configure an alert for this message.
