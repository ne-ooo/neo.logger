---
name: go-to-production
description: >
  Production readiness checklist for @lpm.dev/neo.logger. Covers FileTransport
  rotation (rotate, maxSize, maxFiles), JSON format for log aggregation (ELK,
  Datadog, CloudWatch), LOG_LEVEL environment configuration, ConsoleTransport
  color/TTY handling in containers and Docker, transport error handling and
  fire-and-forget behavior, and performance considerations. Load before
  deploying to production.
type: lifecycle
library: neo.logger
library_version: "0.1.0"
requires:
  - getting-started
  - custom-transports
sources:
  - "lpmdev/neo:packages/logger/src/core/transport.ts"
  - "lpmdev/neo:packages/logger/src/utils/rotate.ts"
  - "lpmdev/neo:packages/logger/README.md"
---

This skill builds on getting-started and custom-transports. Read them first.

# @lpm.dev/neo.logger — Go to Production Checklist

Run through each section before deploying.

## File Rotation Checks

### Check: FileTransport has rotation enabled

Expected:

```typescript
new FileTransport({
  path: '/var/log/app.log',
  format: 'json',
  rotate: true,
  maxSize: 10 * 1024 * 1024,  // 10MB
  maxFiles: 5
})
```

Fail condition: `rotate` is missing or `false` on any FileTransport in production.

Fix: Add `rotate: true` with explicit `maxSize` and `maxFiles`. Default `rotate` is `false` — log files grow unbounded without it.

### Check: Rotation file naming matches log cleanup scripts

Expected:

```typescript
// Rotated files follow this pattern:
// app.log → app.log.1 → app.log.2 → ... → app.log.5 (deleted)
```

Fail condition: Log cleanup scripts or monitoring look for `app.1.log` instead of `app.log.1`.

Fix: Update cleanup scripts to match `${path}.${n}` pattern (e.g. `app.log.*`).

## Output Format Checks

### Check: JSON format for log aggregation

Expected:

```typescript
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new ConsoleTransport({ colors: false }),
    new FileTransport({ path: '/var/log/app.log', format: 'json', rotate: true })
  ]
})
```

Fail condition: Production uses only `ConsoleTransport` with pretty output and no structured JSON destination.

Fix: Add a `FileTransport` with `format: 'json'` or pipe `ConsoleTransport` output (with `colors: false`) to a log aggregator.

### Check: Console colors disabled for containers

Expected:

```typescript
new ConsoleTransport({ colors: false })
```

Fail condition: `colors` is unset (defaults to `process.stdout.isTTY`). Docker containers with TTY allocated will inject ANSI codes into log aggregators.

Fix: Explicitly set `colors: false` in production environments.

## Environment Configuration Checks

### Check: LOG_LEVEL set via environment variable

Expected:

```bash
# In production environment / Dockerfile / deployment config
LOG_LEVEL=info
```

Fail condition: Log level is hardcoded in source code instead of being configurable via environment.

Fix: Use `process.env.LOG_LEVEL` when creating the logger:

```typescript
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info'
})
```

### Check: No debug-level logging in production default

Expected: Production `LOG_LEVEL` is set to `info` or `warn`.

Fail condition: `LOG_LEVEL=debug` in production, causing excessive log volume and potential performance impact.

Fix: Set `LOG_LEVEL=info` for production. Use `debug` only for temporary troubleshooting.

## Transport Reliability Checks

### Check: Custom transports handle errors internally

Expected:

```typescript
new CustomTransport(async (entry) => {
  try {
    await fetch(loggingEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    })
  } catch (err) {
    await fallbackQueue.push(entry)
  }
})
```

Fail condition: Custom transport has no try/catch — errors are caught by the logger and written to stderr, then lost.

Fix: Add error handling with retry logic or fallback queueing inside the transport handler.

### Check: Transport failure does not crash the application

Expected: Neo.logger catches transport errors internally and writes them to `process.stderr`. No action needed — this is the default behavior.

Fail condition: A custom transport re-throws errors or calls `process.exit()` on failure.

Fix: Remove any `process.exit()` calls from transport error handlers. Let the logger's built-in error handling manage transport failures.

## Common Mistakes

### CRITICAL Forgetting to enable rotation on FileTransport

Wrong:

```typescript
new FileTransport({ path: '/var/log/app.log', format: 'json' })
// rotate defaults to false — file grows forever, eventually fills disk
```

Correct:

```typescript
new FileTransport({
  path: '/var/log/app.log',
  format: 'json',
  rotate: true,
  maxSize: 10 * 1024 * 1024,
  maxFiles: 5
})
```

`FileTransport` defaults `rotate` to `false`. In production, unrotated log files will grow until the disk is full.

Source: src/core/transport.ts:65

### HIGH Not using JSON format for log aggregation

Wrong:

```typescript
const logger = createLogger({ level: 'info' })
// Only ConsoleTransport with pretty output — unusable by log aggregators
```

Correct:

```typescript
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new ConsoleTransport({ colors: false }),
    new FileTransport({ path: 'app.log', format: 'json', rotate: true })
  ]
})
```

Log aggregators (ELK, Datadog, CloudWatch) require structured JSON. Pretty console output contains ANSI codes and unstructured text that cannot be parsed.

Source: README.md — Next.js integration example

### MEDIUM ConsoleTransport colors polluting log aggregators

Wrong:

```typescript
new ConsoleTransport()
// colors defaults to process.stdout.isTTY — may be true in Docker with TTY
```

Correct:

```typescript
new ConsoleTransport({ colors: false })
```

`ConsoleTransport` defaults `colors` to `process.stdout.isTTY`. Docker containers with TTY allocated (`docker run -t`) will inject ANSI escape codes into log output, corrupting log aggregator parsing.

Source: src/core/transport.ts:23

### HIGH Tension: Fire-and-forget vs delivery guarantees

Transport writes are fire-and-forget. The logger's `write()` method calls `transport.write(entry).catch()` and continues immediately. Agents building production logging pipelines tend to assume writes are confirmed when the log method returns, or omit retry logic in custom transports because they expect the framework to handle failures. Neo.logger prioritizes performance over delivery guarantees — custom transports must implement their own reliability.

See also: custom-transports/SKILL.md § Common Mistakes

## Pre-Deploy Summary

- [ ] FileTransport has `rotate: true` with explicit `maxSize` and `maxFiles`
- [ ] JSON format configured for log aggregation
- [ ] ConsoleTransport has `colors: false` in production
- [ ] `LOG_LEVEL` set via environment variable, not hardcoded
- [ ] Production default is `info` or `warn`, not `debug`
- [ ] Custom transports have internal error handling with retry/fallback
- [ ] Log cleanup scripts match `${path}.${n}` rotation naming

See also: getting-started/SKILL.md — for logger setup fundamentals
See also: custom-transports/SKILL.md — for transport configuration details
