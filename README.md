# @lpm.dev/neo.logger

`@lpm.dev/neo.logger` writes text or JSON logs to the console, files, and custom
transports in Node.js.

## Features

- **Log levels:** Supports `debug`, `info`, `warn`, `error`, and `silent`
  levels.
- **Transports:** Writes to the console, rotating files, and an
  application-defined destination.
- **Delivery controls:** Uses bounded queues, ordered writes, batching,
  `flush()`, and `close()` for asynchronous delivery.
- **Data protection:** Redacts structured fields and escapes control characters
  in text output.
- **TypeScript support:** The package includes strict declarations for ESM and
  CommonJS.
- **Dependency surface:** The package has no runtime dependencies.

## Install

Install the package with LPM:

```bash
lpm install @lpm.dev/neo.logger
```

## Quick start

```typescript
import logger from "@lpm.dev/neo.logger";

logger.info("Server started", { port: 3000 });
logger.warn("High memory usage", { usage: "85%" });

try {
  await connectToDatabase();
} catch (error) {
  const failure = error instanceof Error ? error : new Error(String(error));
  logger.error("Database connection failed", failure);
}

await logger.close();
```

## API

### Default logger

The default export uses the `info` level and a `ConsoleTransport`. The
`LOG_LEVEL` environment variable can change its initial level.

```typescript
import logger from "@lpm.dev/neo.logger";

logger.debug("Diagnostic message");
logger.info("Request completed", { status: 200 });
logger.warn("Retry limit is near", { retries: 4 });
logger.error("Request failed", new Error("Connection refused"), {
  requestId: "req-123",
});
```

### `createLogger(options?): Logger`

`createLogger()` creates an independent logger.

| Option             | Type                       | Default           | Description                                        |
| ------------------ | -------------------------- | ----------------- | -------------------------------------------------- |
| `level`            | `LogLevelInput`            | `"info"`          | Set the minimum log level.                         |
| `namespace`        | `string`                   | None              | Add a namespace to each entry.                     |
| `transports`       | `Transport[]`              | Console transport | Select the output destinations.                    |
| `maxQueueSize`     | `number`                   | `10000`           | Set the maximum pending writes for each transport. |
| `overflowStrategy` | `"drop-newest" \| "throw"` | `"drop-newest"`   | Select the behavior for a full queue.              |
| `redact`           | `RedactionConfig`          | Disabled          | Redact structured fields before delivery.          |

```typescript
import {
  ConsoleTransport,
  createLogger,
  FileTransport,
} from "@lpm.dev/neo.logger";

const logger = createLogger({
  level: "debug",
  namespace: "app",
  transports: [
    new ConsoleTransport({ colors: true }),
    new FileTransport({ path: "app.log", format: "json" }),
  ],
});
```

### Logger methods

| Method                         | Description                                                      |
| ------------------------------ | ---------------------------------------------------------------- |
| `debug(message, data?)`        | Write a debug entry.                                             |
| `info(message, data?)`         | Write an informational entry.                                    |
| `warn(message, data?)`         | Write a warning entry.                                           |
| `error(message, data?)`        | Write an error entry with structured data.                       |
| `error(message, error, data?)` | Write an error entry with an Error-like value and optional data. |
| `child(namespace)`             | Create a namespaced child logger.                                |
| `setLevel(level)`              | Change the shared minimum level.                                 |
| `getLevel()`                   | Return the current `LogLevel`.                                   |
| `flush()`                      | Wait for all accepted writes.                                    |
| `close()`                      | Flush, close the transports, and reject later delivery.          |

Level strings ignore letter case and surrounding whitespace. The aliases
`warning` and `none` map to `warn` and `silent`.

Invalid strings and numeric values outside 0 through 4 cause `parseLevel()` and
`setLevel()` to throw a `RangeError`.

### Child loggers

Child loggers add namespaces. A logger tree shares one live level and the same
transports.

```typescript
import { createLogger } from "@lpm.dev/neo.logger";

const logger = createLogger({ namespace: "app" });
const databaseLogger = logger.child("database");
const cacheLogger = databaseLogger.child("cache");

databaseLogger.info("Connected");
// Namespace: app:database

logger.setLevel("debug");
cacheLogger.debug("Cache hit");
// Namespace: app:database:cache
```

### `ConsoleTransport(options?)`

The console transport writes warning and error entries to `stderr` by default.
It writes other entries to `stdout`.

| Option   | Type      | Default       | Description                                 |
| -------- | --------- | ------------- | ------------------------------------------- |
| `stderr` | `boolean` | `true`        | Send warning and error entries to `stderr`. |
| `colors` | `boolean` | TTY detection | Add ANSI colors.                            |

```typescript
import { ConsoleTransport } from "@lpm.dev/neo.logger";

const transport = new ConsoleTransport({
  stderr: true,
  colors: true,
});
```

### `FileTransport(options)`

The file transport writes JSON or text records. It can rotate files by size.

| Option           | Type               | Default  | Description                                     |
| ---------------- | ------------------ | -------- | ----------------------------------------------- |
| `path`           | `string`           | Required | Set the log-file path.                          |
| `format`         | `"json" \| "text"` | `"json"` | Select the record format.                       |
| `rotate`         | `boolean`          | `false`  | Rotate the file by size.                        |
| `maxSize`        | `number`           | 10 MiB   | Set the byte limit before rotation.             |
| `maxFiles`       | `number`           | `5`      | Keep this number of backup files.               |
| `mode`           | `number`           | `0o600`  | Set the maximum accepted permission bits.       |
| `followSymlinks` | `boolean`          | `false`  | Permit a trusted final-component symbolic link. |

```typescript
import { FileTransport } from "@lpm.dev/neo.logger";

const transport = new FileTransport({
  path: "app.log",
  format: "json",
  rotate: true,
  maxSize: 10 * 1024 * 1024,
  maxFiles: 5,
  mode: 0o600,
  followSymlinks: false,
});
```

`maxSize` must be a positive safe integer. `maxFiles` must be an integer from 1
through 10,000.

For invalid rotation options, the transport throws during construction. Rotation
cannot use `followSymlinks: true`.

When `app.log` reaches its limit, the transport renames it to `app.log.1`.
Existing backups move to the next number.

### `CustomTransport(handler)`

The custom transport calls a synchronous or asynchronous handler for each entry.

```typescript
import { CustomTransport } from "@lpm.dev/neo.logger";

const transport = new CustomTransport(async (entry) => {
  await fetch("https://logs.example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
});
```

### Custom transport interface

A transport can implement `write()`, `writeBatch()`, `flush()`, and `close()`.

```typescript
import type { LogEntry, Transport } from "@lpm.dev/neo.logger";

class ApplicationTransport implements Transport {
  async write(entry: LogEntry): Promise<void> {
    await saveEntry(entry);
  }

  async flush(): Promise<void> {
    await flushEntries();
  }
}
```

### Level and formatting utilities

The main entry also exports these utilities:

| Export                                  | Purpose                                              |
| --------------------------------------- | ---------------------------------------------------- |
| `LogLevel`                              | Numeric level enum from `DEBUG` through `SILENT`.    |
| `LogLevelName`                          | Map numeric levels to names.                         |
| `parseLevel(level)`                     | Parse a supported level string or number.            |
| `shouldLog(messageLevel, minimumLevel)` | Compare two levels.                                  |
| `formatConsole(entry, options?)`        | Format an entry as text.                             |
| `formatJSON(entry)`                     | Format an entry as JSON.                             |
| `shouldRotate(path, maxSize)`           | Check whether a regular file reached its size limit. |
| `rotateFiles(path, maxFiles)`           | Rotate a file and its numbered backups.              |
| `formatTimestamp(timestamp)`            | Format a timestamp as ISO 8601.                      |
| `formatHumanTime(timestamp)`            | Format a timestamp with local date and time fields.  |
| `getCurrentTimestamp()`                 | Return `Date.now()`.                                 |
| `parseStack(error)`                     | Parse supported stack frames.                        |
| `formatStack(error)`                    | Format supported stack frames as text.               |

## Delivery and limits

Log calls enqueue accepted writes and return immediately. Each transport keeps
the call order of its writes.

When the logger must remain active, call `flush()`. Before an intentional
process exit, call `close()`.

When the logger is no longer necessary, call `close()`.

```typescript
logger.info("Shutdown requested");
await logger.close();
```

- Each transport accepts at most 10,000 pending writes by default.
- The default overflow strategy reports the error to `stderr` and drops the
  newest entry.
- The `"throw"` strategy reports queue saturation to the calling code
  immediately.
- A transport can receive batches of no more than 256 ordered entries.
- If a transport fails or the queue drops an entry, `flush()` rejects.
- `close()` runs each transport lifecycle hook and prevents later writes.

The package serializes file writes and rotation by resolved path in one process.
Multiple processes require an external coordinator such as `logrotate`.

## Security

Set `redact: true` to redact common password, token, authorization, cookie,
API-key, client-secret, and session-ID fields.

```typescript
import { createLogger } from "@lpm.dev/neo.logger";

const logger = createLogger({
  redact: {
    paths: [
      "user.ssn",
      "payments.*.cardNumber",
      "request.headers.authorization",
    ],
    censor: "<hidden>",
  },
});
```

Redaction supports dot paths, `*`, and recursive `**` wildcards. It creates a
data snapshot before any transport receives the entry.

Redaction applies only to `entry.data`. Do not put credentials in a message or
error text.

Text output escapes control characters from untrusted fields. Error stacks
remain multiline, and each continuation starts with `|`.

JSON output escapes raw Unicode controls. `JSON.parse()` restores the original
string value.

New log files use mode `0600`. Before each append, the transport makes sure that
the descriptor points to a regular file.

On POSIX, the transport also requires current-process ownership and permissions
no broader than `mode`.

The transport rejects final-component symbolic links with `O_NOFOLLOW` where the
platform supports it. Use only directories that untrusted users cannot modify.

If rotation is disabled and the destination is trusted, you can set
`followSymlinks: true`.

## Output formats

Text output is intended for terminals and local files:

```text
2026-01-15T10:30:46.456Z INFO  [app:api] Request processed {"method":"GET","status":200}
2026-01-15T10:30:47.789Z ERROR [app:worker] Task failed
  | Error: Division by zero
  |     at calculate (worker.ts:42:10)
```

JSON output is intended for log processing systems:

```json
{
  "timestamp": 1768473046456,
  "level": "info",
  "namespace": "app:api",
  "message": "Request processed",
  "data": { "method": "GET", "status": 200 }
}
```

## Migration from `winston`

Replace Winston transports and formatters with the transport classes from this
package.

```typescript
import { createLogger, FileTransport } from "@lpm.dev/neo.logger";

const logger = createLogger({
  level: "info",
  transports: [new FileTransport({ path: "combined.log" })],
});
```

`FileTransport` does not provide a per-transport level option. If destinations
require different filters, use separate loggers or a custom transport.

Run the application tests after the migration.

## Migration from `pino`

Use `createLogger()` and select the required transports.

```diff
- import pino from "pino";
- const logger = pino({ level: "info" });
+ import { createLogger } from "@lpm.dev/neo.logger";
+ const logger = createLogger({ level: "info" });
```

Run the application tests after the migration.

## Performance

The repository contains reproducible benchmarks for formatting and completed
transport work.

See [BENCHMARKS.md](./BENCHMARKS.md) for the environment, method, results, and
limits.

Run the benchmark suite:

```bash
lpm run bench
```

Benchmark results depend on the runtime, computer, transport, options, and input
data.

## Runtime support

- **Node.js:** 18 or later
- **Browsers:** Not supported
- **Module formats:** ESM and CommonJS
- **TypeScript:** Declaration files for ESM and CommonJS

## License

MIT. See [LICENSE](./LICENSE).
