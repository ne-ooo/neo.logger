# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Ordered, bounded per-transport write queues with configurable overflow handling
- `logger.flush()` and idempotent `logger.close()` delivery lifecycle methods
- Optional `flush()` and `close()` hooks for custom transports
- Safe serialization for BigInt, circular references, error causes, and custom error properties
- Pre-transport structured-data redaction with common-secret defaults and wildcard paths
- Public `ErrorLike`, `LogLevelInput`, and `LogLevelString` types
- Typed `error(message, data)` and `error(message, error, data?)` overloads
- Optional `Transport.writeBatch()` hook for bounded, ordered delivery batches

### Fixed

- Concurrent file writes and rotation are serialized by resolved path within each process
- Synchronous transport throws and non-Error rejections no longer escape or block other transports
- Console writes now respect stream backpressure
- Text output escapes record-forging, terminal, and bidirectional control characters
- Error stacks prefix every physical continuation line
- New file logs default to mode `0600` and reject final-component symlinks where supported
- Invalid log levels and file-rotation limits now fail fast with `RangeError`
- Cross-realm and serialized error-like values are preserved as errors
- Error-like classification avoids hostile prototype-chain traversal
- Existing child logger families now share dynamic level changes
- File transports batch burst writes while preserving per-entry rotation boundaries
- Benchmarks now measure completed formatting and delivery work
- Path redaction now handles aliases, cycles, native errors, and multi-`**` patterns without leaking values or exponential backtracking
- Redaction size bounds now cover broad objects and oversized sparse arrays with one truncation marker
- Native Error redaction bounds hostile prototype-chain traversal
- Saturated transport queues skip unnecessary redaction work for entries that will be dropped
- Sparse file rotation now scales with existing backups instead of the configured retention limit
- Rotation-enabled writes reuse the validated active-file descriptor when no rotation is needed
- Existing log targets are validated for file type, ownership, and configured permission limits before append
- Rotation now rejects followed symbolic-link destinations instead of silently breaking the link
- Public stack formatting escapes terminal controls
- JSON fallbacks preserve primary errors and distinguish repeated error aliases from true cycles
- Error serialization recursively snapshots nested metadata without invoking custom `toJSON` methods
- Error serialization bounds deep and broad metadata, including oversized sparse arrays
- CommonJS consumers now receive declarations matching the runtime default-export compatibility shape
- Development dependencies are pinned to patched Vitest, Vite, and esbuild lines

## [1.0.0] - 2026-03-09

### Added

- **Logger class** — `new Logger(options?)` with `debug()`, `info()`, `warn()`, and `error()` methods
- **`createLogger(options?)`** — Factory function for custom logger instances
- **Default logger** — Pre-configured default export using `LOG_LEVEL` env var
- **Transports** — `ConsoleTransport`, `FileTransport`, `CustomTransport`
- **Log levels** — `LogLevel` enum, `parseLevel()`, `shouldLog()` utilities
- **Formatters** — `formatConsole()` (colored, human-readable), `formatJSON()` (structured JSON)
- **Log rotation** — `shouldRotate()`, `rotateFiles()` for file-based log management
- **Utilities** — `formatTimestamp()`, `formatHumanTime()`, `getCurrentTimestamp()`, `parseStack()`, `formatStack()`
- Full TypeScript types: `LogEntry`, `LoggerOptions`, `Transport`, `FormatterOptions`, `FileTransportOptions`, `ConsoleTransportOptions`, `StackFrame`
- Zero runtime dependencies
- ESM + CJS dual output with TypeScript declaration files
- Source maps for debugging
- 179 unit and integration tests, plus CJS and ESM package smoke checks
