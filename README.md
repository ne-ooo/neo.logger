# @lpm.dev/neo.logger

> Zero-dependency production logger - Fast, modern alternative to winston and pino

[![npm version](https://badge.fury.io/js/@lpm.dev%2Fneo.logger.svg)](https://www.npmjs.com/package/@lpm.dev/neo.logger)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

✅ **Zero dependencies** - Completely self-contained
✅ **Dual output** - Pretty console AND structured JSON
✅ **Multiple log levels** - debug, info, warn, error, silent
✅ **File logging** - With automatic rotation support
✅ **TypeScript-first** - Full type safety with strict mode
✅ **ESM + CommonJS** - Works everywhere
✅ **Fast** - Competitive with pino, simpler than winston
✅ **Small** - ~12KB bundle size
✅ **Child loggers** - Namespaced loggers with inheritance
✅ **Custom transports** - Extensible output system

## Installation

```bash
lpm install @lpm.dev/neo.logger
```

## Quick Start

```typescript
import logger from '@lpm.dev/neo.logger'

logger.info('Server started', { port: 3000 })
logger.warn('High memory usage', { usage: '85%' })
logger.error('Database connection failed', error)
```

Output:
```
2024-01-15T10:30:45.123Z INFO  Server started {"port":3000}
2024-01-15T10:30:46.456Z WARN  High memory usage {"usage":"85%"}
2024-01-15T10:30:47.789Z ERROR Database connection failed
Error: Connection refused
    at connect (database.ts:42:10)
    at main (app.ts:15:3)
```

## Why neo.logger?

### vs Winston

- ✅ **Zero dependencies** (vs 20+ dependencies)
- ✅ **Simpler API** - No complex transports/formats setup
- ✅ **TypeScript-first** - Full type safety built-in
- ✅ **Smaller bundle** - ~12KB vs ~50KB

### vs Pino

- ✅ **Zero dependencies** (vs 10+ dependencies)
- ✅ **Pretty console built-in** - No extra deps needed
- ✅ **Simpler transport system** - No worker threads required
- ✅ **Dual output** - Console AND JSON without complexity

### vs Bunyan

- ✅ **Actively maintained** - Modern, up-to-date
- ✅ **Zero dependencies** - No optional deps
- ✅ **TypeScript-first** - Native TS support
- ✅ **Better performance** - Modern implementation

## API Reference

### Default Logger

```typescript
import logger from '@lpm.dev/neo.logger'

logger.debug('Debug message')
logger.info('Info message')
logger.warn('Warning message')
logger.error('Error message')

// With structured data
logger.info('User logged in', { userId: 123, ip: '192.168.1.1' })

// With error object
logger.error('Failed to process', error, { taskId: 456 })
```

### Create Custom Logger

```typescript
import { createLogger, FileTransport } from '@lpm.dev/neo.logger'

const logger = createLogger({
  level: 'debug',
  namespace: 'app',
  transports: [
    new ConsoleTransport({ colors: true }),
    new FileTransport({ path: 'app.log', format: 'json' })
  ]
})
```

### Log Levels

```typescript
import { LogLevel } from '@lpm.dev/neo.logger'

// Set log level
logger.setLevel('debug')  // Show all messages
logger.setLevel('info')   // Hide debug messages
logger.setLevel('warn')   // Only warn and error
logger.setLevel('error')  // Only errors
logger.setLevel('silent') // Suppress all output

// Get current level
const level = logger.getLevel()
console.log(LogLevelName[level]) // 'info'
```

### Child Loggers

Create namespaced loggers that inherit parent configuration:

```typescript
const logger = createLogger({ namespace: 'app' })

// Create child loggers
const dbLogger = logger.child('database')
const redisLogger = dbLogger.child('redis')

dbLogger.info('Connected')    // [app:database] Connected
redisLogger.debug('Cache hit') // [app:database:redis] Cache hit
```

## Transports

### Console Transport

Write logs to stdout/stderr with ANSI colors:

```typescript
import { ConsoleTransport } from '@lpm.dev/neo.logger'

const transport = new ConsoleTransport({
  stderr: true,  // Use stderr for warn/error (default: true)
  colors: true   // Enable ANSI colors (default: auto-detect TTY)
})
```

### File Transport

Write logs to a file with optional rotation:

```typescript
import { FileTransport } from '@lpm.dev/neo.logger'

const transport = new FileTransport({
  path: 'app.log',
  format: 'json',           // 'json' or 'text'
  rotate: true,             // Enable rotation
  maxSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5               // Keep 5 backup files
})
```

**Rotation behavior:**
- When `app.log` reaches 10MB, it's renamed to `app.log.1`
- Existing backups shift: `app.log.1` → `app.log.2`, etc.
- Oldest file (`app.log.5`) is deleted

### Custom Transport

Create your own transport for custom logging destinations:

```typescript
import { CustomTransport } from '@lpm.dev/neo.logger'

const transport = new CustomTransport(async (entry) => {
  // Send to external service
  await fetch('https://logs.example.com', {
    method: 'POST',
    body: JSON.stringify(entry)
  })
})
```

### Multiple Transports

Log to multiple destinations simultaneously:

```typescript
const logger = createLogger({
  transports: [
    new ConsoleTransport({ colors: true }),
    new FileTransport({ path: 'app.log', format: 'json' }),
    new FileTransport({ path: 'errors.log', format: 'text' }),
    new CustomTransport(sendToExternalService)
  ]
})
```

## Formatting

### Console Format (Pretty)

Colorful, human-readable output for development:

```
2024-01-15T10:30:45.123Z DEBUG [app:cache] Cache hit {"key":"user:123","ttl":3600}
2024-01-15T10:30:46.456Z INFO  [app:api] Request processed {"method":"GET","path":"/users","duration":45}
2024-01-15T10:30:47.789Z WARN  [app:db] Connection pool exhausted {"active":100,"idle":0}
2024-01-15T10:30:48.012Z ERROR [app:worker] Task failed
Error: Division by zero
    at calculate (worker.ts:42:10)
    at process (app.ts:15:3)
```

### JSON Format (Structured)

Machine-readable format for production/log aggregation:

```json
{"timestamp":1705318245123,"level":"info","namespace":"app:api","message":"Request processed","data":{"method":"GET","path":"/users","duration":45}}
{"timestamp":1705318248012,"level":"error","namespace":"app:worker","message":"Task failed","error":{"message":"Division by zero","name":"Error","stack":"Error: Division by zero\n    at calculate..."}}
```

## Environment Configuration

The default logger respects the `LOG_LEVEL` environment variable:

```bash
# Development
export LOG_LEVEL=debug

# Production
export LOG_LEVEL=info

# Suppress all logs
export LOG_LEVEL=silent
```

## TypeScript

Full TypeScript support with strict type safety:

```typescript
import type {
  Logger,
  LoggerOptions,
  LogEntry,
  Transport,
  FileTransportOptions,
  ConsoleTransportOptions
} from '@lpm.dev/neo.logger'

// Type-safe configuration
const options: LoggerOptions = {
  level: 'debug',
  namespace: 'myapp'
}

// Custom transport with type safety
class MyTransport implements Transport {
  async write(entry: LogEntry): Promise<void> {
    // TypeScript knows all fields
    console.log(entry.timestamp, entry.level, entry.message)
  }
}
```

## Advanced Usage

### Conditional Logging

```typescript
if (logger.getLevel() <= LogLevel.DEBUG) {
  // Expensive computation only when debug is enabled
  const debugData = computeExpensiveDebugInfo()
  logger.debug('Debug data', debugData)
}
```

### Dynamic Log Levels

```typescript
// Change log level at runtime
if (process.env.NODE_ENV === 'production') {
  logger.setLevel('warn')
} else {
  logger.setLevel('debug')
}

// Temporarily increase verbosity
const originalLevel = logger.getLevel()
logger.setLevel('debug')
await debugFunction()
logger.setLevel(originalLevel)
```

### Structured Data

```typescript
// Add context to every log
logger.info('User action', {
  userId: 123,
  action: 'purchase',
  amount: 99.99,
  timestamp: Date.now(),
  metadata: {
    sessionId: 'abc123',
    userAgent: req.headers['user-agent']
  }
})
```

### Error Logging

```typescript
try {
  await riskyOperation()
} catch (error) {
  // Log error with context
  logger.error('Operation failed', error, {
    operation: 'riskyOperation',
    attempt: retryCount,
    userId: currentUser.id
  })
}
```

## Examples

### Express.js Integration

```typescript
import express from 'express'
import { createLogger } from '@lpm.dev/neo.logger'

const logger = createLogger({ namespace: 'api' })
const app = express()

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now()

  res.on('finish', () => {
    const duration = Date.now() - start
    logger.info('Request processed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration
    })
  })

  next()
})

app.listen(3000, () => {
  logger.info('Server started', { port: 3000 })
})
```

### Next.js Integration

```typescript
// lib/logger.ts
import { createLogger, FileTransport, ConsoleTransport } from '@lpm.dev/neo.logger'

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  namespace: 'app',
  transports: [
    new ConsoleTransport(),
    ...(process.env.NODE_ENV === 'production'
      ? [new FileTransport({ path: 'app.log', format: 'json', rotate: true })]
      : []
    )
  ]
})

// app/api/route.ts
import { logger } from '@/lib/logger'

export async function GET() {
  logger.info('API endpoint called')
  return Response.json({ status: 'ok' })
}
```

### Worker/Background Jobs

```typescript
import { createLogger } from '@lpm.dev/neo.logger'

const logger = createLogger({ namespace: 'worker' })

async function processJob(job) {
  const jobLogger = logger.child(`job:${job.id}`)

  jobLogger.info('Job started', { type: job.type })

  try {
    await job.execute()
    jobLogger.info('Job completed', { duration: job.duration })
  } catch (error) {
    jobLogger.error('Job failed', error, { retries: job.retries })
  }
}
```

## Performance

Neo.logger is designed for production use with competitive performance:

- **Fast writes** - Non-blocking async I/O
- **Minimal overhead** - Modern JavaScript patterns
- **Efficient formatting** - Single-pass string building
- **Level filtering** - Skip processing for filtered logs

## Bundle Size

- **ESM**: 11 KB
- **CommonJS**: 12 KB
- **Types**: 14 KB

Despite being feature-rich, neo.logger maintains a small bundle size.

## Migration from Other Loggers

### From Winston

```typescript
// Before (winston)
import winston from 'winston'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
})

// After (neo.logger)
import { createLogger, FileTransport } from '@lpm.dev/neo.logger'

const logger = createLogger({
  level: 'info',
  transports: [
    new FileTransport({ path: 'error.log' }),
    new FileTransport({ path: 'combined.log' })
  ]
})
```

### From Pino

```typescript
// Before (pino)
import pino from 'pino'

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty'
  }
})

// After (neo.logger) - pretty console built-in!
import { createLogger } from '@lpm.dev/neo.logger'

const logger = createLogger({ level: 'info' })
```

## Best Practices

1. **Use child loggers for modules**
   ```typescript
   const dbLogger = logger.child('database')
   const apiLogger = logger.child('api')
   ```

2. **Include structured data**
   ```typescript
   logger.info('Event occurred', { userId, action, timestamp })
   ```

3. **Use appropriate log levels**
   - `debug`: Detailed diagnostic information
   - `info`: General informational messages
   - `warn`: Warning messages, non-critical issues
   - `error`: Error messages, failures

4. **Rotate large log files**
   ```typescript
   new FileTransport({
     path: 'app.log',
     rotate: true,
     maxSize: 10 * 1024 * 1024, // 10MB
     maxFiles: 5
   })
   ```

5. **Configure via environment**
   ```typescript
   const logger = createLogger({
     level: process.env.LOG_LEVEL || 'info'
   })
   ```

## FAQ

### Why neo.logger instead of winston?

Neo.logger modernizes logging with:
- Zero dependencies (winston has 20+)
- Simpler, more intuitive API
- Native TypeScript support
- Similar performance with less complexity

### Why neo.logger instead of pino?

While pino is fast, neo.logger offers:
- Zero dependencies (pino has 10+)
- Built-in pretty console (no extra deps)
- Simpler transport system (no worker threads)
- Easier to understand and customize

### Does it support log rotation?

Yes! File transport includes built-in rotation:
```typescript
new FileTransport({
  path: 'app.log',
  rotate: true,
  maxSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5                 // Keep 5 backups
})
```

### Can I send logs to external services?

Yes, use a custom transport:
```typescript
new CustomTransport(async (entry) => {
  await sendToDatadog(entry)
  await sendToSentry(entry)
})
```

### How do I suppress logs in tests?

Set log level to silent:
```typescript
logger.setLevel('silent')
```

Or create a test-specific logger:
```typescript
const testLogger = createLogger({ level: 'silent' })
```

## License

MIT

## Links

- [Documentation](https://lpm.dev/docs/neo.logger)
- [GitHub](https://github.com/lpm-dev/neo.logger)
- [npm](https://www.npmjs.com/package/@lpm.dev/neo.logger)
