---
name: custom-transports
description: >
  Build and configure transports for @lpm.dev/neo.logger. Covers Transport
  interface, ConsoleTransport (stderr, colors, TTY detection), FileTransport
  (path, format, rotate, maxSize, maxFiles), CustomTransport (async handler),
  formatConsole(), formatJSON(), shouldRotate(), rotateFiles(), multiple
  transport configuration, and LogEntry shape. Load when sending logs to
  external services, files, or custom destinations.
type: core
library: neo.logger
library_version: "0.1.0"
requires:
  - getting-started
sources:
  - "lpmdev/neo:packages/logger/src/core/transport.ts"
  - "lpmdev/neo:packages/logger/src/core/formatter.ts"
  - "lpmdev/neo:packages/logger/src/utils/rotate.ts"
  - "lpmdev/neo:packages/logger/src/types.ts"
---

This skill builds on getting-started. Read it first for logger setup and configuration.

# @lpm.dev/neo.logger — Custom Transports

## Setup

```typescript
import { createLogger, ConsoleTransport, FileTransport, CustomTransport } from '@lpm.dev/neo.logger'

const logger = createLogger({
  level: 'info',
  namespace: 'app',
  transports: [
    new ConsoleTransport({ colors: true, stderr: true }),
    new FileTransport({ path: 'app.log', format: 'json', rotate: true }),
    new CustomTransport(async (entry) => {
      await fetch('https://logs.example.com/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      })
    })
  ]
})
```

## Core Patterns

### ConsoleTransport with stderr routing

```typescript
import { ConsoleTransport } from '@lpm.dev/neo.logger'

const transport = new ConsoleTransport({
  stderr: true,  // warn and error go to stderr (default: true)
  colors: true   // ANSI colors (default: process.stdout.isTTY)
})
```

When `stderr` is `true`, log entries with level `warn` or `error` are written to `process.stderr`. All others go to `process.stdout`.

### FileTransport with rotation

```typescript
import { FileTransport } from '@lpm.dev/neo.logger'

const transport = new FileTransport({
  path: '/var/log/app.log',
  format: 'json',              // 'json' or 'text' (default: 'json')
  rotate: true,                // enable rotation (default: false)
  maxSize: 10 * 1024 * 1024,   // 10MB (default: 10MB)
  maxFiles: 5                  // keep 5 backups (default: 5)
})
```

Rotation renames `app.log` → `app.log.1` → `app.log.2` → ... → `app.log.5` (oldest deleted).

### Implement the Transport interface

```typescript
import type { Transport, LogEntry } from '@lpm.dev/neo.logger'

class DatadogTransport implements Transport {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async write(entry: LogEntry): Promise<void> {
    await fetch('https://http-intake.logs.datadoghq.com/api/v2/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': this.apiKey
      },
      body: JSON.stringify({
        message: entry.message,
        level: entry.level,
        timestamp: entry.timestamp,
        service: entry.namespace,
        ...entry.data
      })
    })
  }
}
```

The `LogEntry` shape:

```typescript
interface LogEntry {
  timestamp: number       // Unix milliseconds
  level: string           // 'debug' | 'info' | 'warn' | 'error'
  message: string
  namespace?: string
  data?: Record<string, any>
  error?: Error
}
```

### Use formatters for custom output

```typescript
import { formatConsole, formatJSON } from '@lpm.dev/neo.logger'
import type { LogEntry } from '@lpm.dev/neo.logger'

const entry: LogEntry = {
  timestamp: Date.now(),
  level: 'info',
  message: 'Request processed',
  data: { method: 'GET', path: '/users' }
}

formatConsole(entry, { colors: false, timestamp: true })
// '2026-03-10T10:30:45.123Z INFO  Request processed {"method":"GET","path":"/users"}'

formatJSON(entry)
// '{"timestamp":1741603845123,"level":"info","message":"Request processed","data":{"method":"GET","path":"/users"}}'
```

## Common Mistakes

### HIGH Implementing Transport without async write method

Wrong:

```typescript
class MyTransport implements Transport {
  write(entry: LogEntry): void {
    console.log(entry.message)
  }
}
```

Correct:

```typescript
class MyTransport implements Transport {
  async write(entry: LogEntry): Promise<void> {
    console.log(entry.message)
  }
}
```

The `Transport` interface requires `write()` to return `Promise<void>`. A synchronous return causes a type error that TypeScript may not catch if strict mode is off, and the logger's internal `.catch()` handler will fail.

Source: src/types.ts:34-37

### HIGH Unhandled errors in custom transport handlers

Wrong:

```typescript
new CustomTransport(async (entry) => {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(entry) })
  // If fetch throws, error is caught internally and written to stderr — then lost
})
```

Correct:

```typescript
new CustomTransport(async (entry) => {
  try {
    await fetch(url, { method: 'POST', body: JSON.stringify(entry) })
  } catch (err) {
    await fallbackQueue.push(entry)
  }
})
```

Transport write errors are caught by the logger and written to `process.stderr` as a one-line message. The error is not retried or queued. Custom transports that need reliability must handle errors internally.

Source: src/core/logger.ts:151-153

### HIGH Using pino-style transport configuration object

Wrong:

```typescript
const logger = createLogger({
  transport: { target: 'pino-pretty' }
})
```

Correct:

```typescript
const logger = createLogger({
  transports: [new ConsoleTransport({ colors: true })]
})
```

Neo.logger uses a `transports` array of class instances, not a `transport` object with string targets. The `transport` key is silently ignored.

Source: src/types.ts:28

### MEDIUM FileTransport rotation file naming convention

Wrong:

```typescript
// Expecting rotation creates app.1.log, app.2.log
const backups = glob.sync('app.*.log')
```

Correct:

```typescript
// Rotation creates app.log.1, app.log.2, etc.
const backups = glob.sync('app.log.*')
```

Rotated files append the index after the full filename: `app.log.1`, `app.log.2`, not `app.1.log`.

Source: src/utils/rotate.ts:50

### HIGH Tension: Simplicity vs per-transport filtering

Neo.logger has a single log level per Logger instance — all transports receive the same entries. Agents optimizing for selective output (e.g. errors-only to a file) tend to look for a `level` option on transports, which does not exist. Use a `CustomTransport` wrapper to filter:

```typescript
new CustomTransport(async (entry) => {
  if (entry.level === 'error') {
    await appendFile('errors.log', JSON.stringify(entry) + '\n')
  }
})
```

See also: getting-started/SKILL.md § Common Mistakes
See also: go-to-production/SKILL.md — for production transport configuration
