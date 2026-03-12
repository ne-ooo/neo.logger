# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-03-09

### Added

- **Logger class** — `new Logger(options?)` with `debug()`, `info()`, `warn()`, `error()`, `silent()` methods
- **`createLogger(options?)`** — Factory function for custom logger instances
- **Default logger** — Pre-configured default export using `LOG_LEVEL` env var
- **Transports** — `ConsoleTransport`, `FileTransport`, `CustomTransport`
- **Log levels** — `LogLevel` enum, `parseLevel()`, `shouldLog()` utilities
- **Formatters** — `formatConsole()` (colored, human-readable), `formatJSON()` (structured JSON)
- **Log rotation** — `shouldRotate()`, `rotateFiles()` for file-based log management
- **Utilities** — `formatTimestamp()`, `formatHumanTime()`, `getCurrentTimestamp()`, `parseStack()`, `formatStack()`
- Optional peer dependency on `@lpm.dev/neo.colors` for colored console output
- Full TypeScript types: `LogEntry`, `LoggerOptions`, `Transport`, `FormatterOptions`, `FileTransportOptions`, `ConsoleTransportOptions`, `StackFrame`
- Zero runtime dependencies (colors via optional peer dep)
- ESM + CJS dual output with TypeScript declaration files
- Source maps for debugging
- 74 tests across logger, transport, formatter, and rotation
