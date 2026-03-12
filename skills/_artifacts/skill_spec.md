# @lpm.dev/neo.logger — Skill Spec

Zero-dependency, TypeScript-first production logger for Node.js (>=18). Provides structured and pretty logging with pluggable transports, child loggers, and file rotation. Positioned as a simpler, faster alternative to winston and pino.

## Domains

| Domain            | Description                                                          | Skills                                          |
| ----------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| Setting up logging | Creating and configuring logger instances, log levels, child loggers | getting-started                                 |
| Delivering logs    | Routing output to destinations via transports                        | custom-transports                               |
| Adopting the logger | Migrating from other loggers and going to production                 | migrate-from-winston, migrate-from-pino, go-to-production |

## Skill Inventory

| Skill                | Type      | Domain    | What it covers                                           | Failure modes |
| -------------------- | --------- | --------- | -------------------------------------------------------- | ------------- |
| getting-started      | lifecycle | setup     | Logger, createLogger, levels, child loggers, error()     | 4             |
| custom-transports    | core      | delivery  | Transport interface, Console/File/Custom, formatters     | 4             |
| migrate-from-winston | lifecycle | adoption  | winston → neo.logger concept mapping                     | 3             |
| migrate-from-pino    | lifecycle | adoption  | pino → neo.logger concept mapping                        | 3             |
| go-to-production     | lifecycle | adoption  | Rotation, JSON output, env config, transport reliability | 3             |

## Failure Mode Inventory

### getting-started (4 failure modes)

| #  | Mistake                                    | Priority | Source                      | Cross-skill?           |
| -- | ------------------------------------------ | -------- | --------------------------- | ---------------------- |
| 1  | Misusing logger.error() overloaded signature | CRITICAL | src/core/logger.ts:90-102   | —                      |
| 2  | Using winston-style log method             | HIGH     | src/core/logger.ts          | migrate-from-winston   |
| 3  | Invalid log level silently defaults to INFO | MEDIUM   | src/core/level.ts:57        | —                      |
| 4  | Expecting logger methods to return Promises | MEDIUM   | src/core/logger.ts:148-156  | —                      |

### custom-transports (4 failure modes)

| #  | Mistake                                         | Priority | Source                   | Cross-skill?       |
| -- | ----------------------------------------------- | -------- | ------------------------ | ------------------ |
| 1  | Implementing Transport without async write      | HIGH     | src/types.ts:34-37       | —                  |
| 2  | Throwing errors in custom transport handlers    | HIGH     | src/core/logger.ts:151   | —                  |
| 3  | Using pino-style transport configuration        | HIGH     | src/types.ts:28          | migrate-from-pino  |
| 4  | FileTransport rotation naming convention        | MEDIUM   | src/utils/rotate.ts:50   | —                  |

### migrate-from-winston (3 failure modes)

| #  | Mistake                                         | Priority | Source                 | Cross-skill?     |
| -- | ----------------------------------------------- | -------- | ---------------------- | ---------------- |
| 1  | Using winston format pipeline                   | HIGH     | src/types.ts:22-29     | —                |
| 2  | Using winston log levels (verbose, silly)        | HIGH     | src/core/level.ts      | getting-started  |
| 3  | Expecting per-transport level filtering         | MEDIUM   | src/types.ts:52-63     | —                |

### migrate-from-pino (3 failure modes)

| #  | Mistake                                         | Priority | Source                   | Cross-skill?        |
| -- | ----------------------------------------------- | -------- | ------------------------ | ------------------- |
| 1  | Using pino child logger with bindings object    | CRITICAL | src/core/logger.ts:176   | —                   |
| 2  | Expecting pino-style serializers                | HIGH     | src/types.ts:22-29       | —                   |
| 3  | Using pino worker thread transport pattern      | HIGH     | src/types.ts:28          | custom-transports   |

### go-to-production (3 failure modes)

| #  | Mistake                                           | Priority | Source                   | Cross-skill? |
| -- | ------------------------------------------------- | -------- | ------------------------ | ------------ |
| 1  | Forgetting to enable rotation on FileTransport    | CRITICAL | src/core/transport.ts:65 | —            |
| 2  | Using ConsoleTransport colors in production       | MEDIUM   | src/core/transport.ts:23 | —            |
| 3  | Not using JSON format for log aggregation         | HIGH     | README.md                | —            |

## Tensions

| Tension                              | Skills                                  | Agent implication                                                              |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------ |
| Simplicity vs per-transport filtering | getting-started ↔ custom-transports     | Agent tries transport-level filtering that doesn't exist; needs CustomTransport wrapper |
| Fire-and-forget vs delivery guarantees | custom-transports ↔ go-to-production    | Agent assumes writes are confirmed; doesn't implement retry in custom transports |
| Migration simplicity vs feature gap  | migrate-from-winston ↔ migrate-from-pino | Agent maps features 1:1 instead of simplifying to neo.logger's model           |

## Cross-References

| From                 | To                 | Reason                                                       |
| -------------------- | ------------------ | ------------------------------------------------------------ |
| getting-started      | go-to-production   | After setup, configure for production (JSON, rotation)       |
| getting-started      | custom-transports  | Default console covers start; custom transports for real apps |
| migrate-from-winston | custom-transports  | Winston migrations involve mapping transport pipelines       |
| migrate-from-pino    | getting-started    | Pino bindings → neo.logger namespaces requires understanding child() |
| custom-transports    | go-to-production   | Production needs custom transports for external services     |

## Subsystems & Reference Candidates

| Skill             | Subsystems | Reference candidates |
| ----------------- | ---------- | -------------------- |
| custom-transports | ConsoleTransport, FileTransport, CustomTransport | — |
| All others        | —          | —                    |

## Remaining Gaps

No remaining gaps — all questions were resolved during the interview.

## Recommended Skill File Structure

- **Core skills:** custom-transports
- **Framework skills:** none (framework-agnostic)
- **Lifecycle skills:** getting-started, migrate-from-winston, migrate-from-pino, go-to-production
- **Composition skills:** none (integrations are example-level, not skill-worthy)
- **Reference files:** none needed (API surface is small enough for inline coverage)

## Composition Opportunities

| Library              | Integration points       | Composition skill needed? |
| -------------------- | ------------------------ | ------------------------- |
| @lpm.dev/neo.colors  | Optional colored console | No — handled internally   |
| Express.js           | Request logging middleware | No — example snippet only |
| Next.js              | App/API route logging    | No — example snippet only |
