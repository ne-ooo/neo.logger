import type {
  ErrorLike,
  LogEntry,
  LogLevelInput,
  LoggerOptions,
  QueueOverflowStrategy,
  Transport,
} from '../types.js'
import { LogLevel, LogLevelName, parseLevel, shouldLog } from './level.js'
import { ConsoleTransport } from './transport.js'
import { escapeLogText } from '../utils/sanitize.js'
import { isErrorLike } from '../utils/error.js'
import { redactData, resolveRedaction } from './redact.js'
import type { ResolvedRedaction } from './redact.js'

const DEFAULT_MAX_QUEUE_SIZE = 10_000
const MAX_TRANSPORT_BATCH_SIZE = 256
const QUEUE_COMPACTION_THRESHOLD = 1_024

interface LevelState {
  value: LogLevel
}

interface TransportState {
  transport: Transport
  queue: LogEntry[]
  queueIndex: number
  active: boolean
  accepting: boolean
  pending: number
  waiters: Array<() => void>
  failureCount: number
  lastFailure: unknown
  overflowReported: boolean
  closedReported: boolean
  closePromise?: Promise<void>
}

const transportStates = new WeakMap<Transport, TransportState>()

function getTransportState(transport: Transport): TransportState {
  const existing = transportStates.get(transport)
  if (existing) {
    return existing
  }

  const state: TransportState = {
    transport,
    queue: [],
    queueIndex: 0,
    active: false,
    accepting: true,
    pending: 0,
    waiters: [],
    failureCount: 0,
    lastFailure: undefined,
    overflowReported: false,
    closedReported: false,
  }
  transportStates.set(transport, state)
  return state
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return false
  }

  return typeof (value as { then?: unknown }).then === 'function'
}

function describeError(error: unknown): string {
  try {
    if (error instanceof Error) {
      return error.message || error.name
    }
    return String(error)
  } catch {
    return 'Unknown transport error'
  }
}

function transportName(transport: Transport): string {
  try {
    return transport.constructor?.name || 'Transport'
  } catch {
    return 'Transport'
  }
}

function writeDiagnostic(message: string): void {
  try {
    process.stderr.write(`[neo.logger] ${escapeLogText(message)}\n`)
  } catch {
    // Logging failures must never crash the application.
  }
}

function recordFailure(state: TransportState, error: unknown, count = 1): void {
  state.failureCount += count
  state.lastFailure = error
}

function reportFailure(state: TransportState, error: unknown, count = 1): void {
  recordFailure(state, error, count)
  writeDiagnostic(`${transportName(state.transport)} write failed: ${describeError(error)}`)
}

function completeWrite(state: TransportState, count = 1): void {
  state.pending -= count
  if (state.pending === 0) {
    state.overflowReported = false
    const waiters = state.waiters.splice(0)
    for (const resolve of waiters) {
      resolve()
    }
  }
}

function compactTransportQueue(state: TransportState): void {
  if (
    state.queueIndex >= QUEUE_COMPACTION_THRESHOLD &&
    state.queueIndex * 2 >= state.queue.length
  ) {
    state.queue = state.queue.slice(state.queueIndex)
    state.queueIndex = 0
  }
}

function drainTransport(state: TransportState): void {
  while (true) {
    if (state.queueIndex >= state.queue.length) {
      state.queue = []
      state.queueIndex = 0
      state.active = false
      return
    }
    const entries = [state.queue[state.queueIndex]!]
    state.queueIndex += 1
    let batchSize = 1

    try {
      const batchWriter = state.transport.writeBatch
      if (typeof batchWriter === 'function') {
        const additionalEntries = Math.min(
          state.queue.length - state.queueIndex,
          MAX_TRANSPORT_BATCH_SIZE - 1,
        )
        entries.push(
          ...state.queue.slice(state.queueIndex, state.queueIndex + additionalEntries),
        )
        state.queueIndex += additionalEntries
        batchSize += additionalEntries
      }
      compactTransportQueue(state)

      const result =
        typeof batchWriter === 'function'
          ? batchWriter.call(state.transport, entries)
          : state.transport.write(entries[0]!)
      if (isPromiseLike(result)) {
        void Promise.resolve(result).then(
          () => {
            completeWrite(state, batchSize)
            drainTransport(state)
          },
          (error: unknown) => {
            reportFailure(state, error, batchSize)
            completeWrite(state, batchSize)
            drainTransport(state)
          },
        )
        return
      }
    } catch (error) {
      reportFailure(state, error, batchSize)
    }

    completeWrite(state, batchSize)
  }
}

function enqueueWrite(
  transport: Transport,
  entry: LogEntry,
  maxQueueSize: number,
  overflowStrategy: QueueOverflowStrategy,
): void {
  const state = getTransportState(transport)

  if (!state.accepting) {
    const error = new Error(`${transportName(transport)} is closed`)
    recordFailure(state, error)
    if (!state.closedReported) {
      state.closedReported = true
      writeDiagnostic(`${transportName(transport)} write failed: ${describeError(error)}`)
    }
    return
  }

  if (state.pending >= maxQueueSize) {
    const error = new Error(
      `${transportName(transport)} queue is full (${String(maxQueueSize)} pending writes)`,
    )
    recordFailure(state, error)

    if (overflowStrategy === 'throw') {
      throw error
    }

    if (!state.overflowReported) {
      state.overflowReported = true
      writeDiagnostic(`${transportName(transport)} write failed: ${describeError(error)}`)
    }
    return
  }

  state.pending += 1
  state.queue.push(entry)
  if (!state.active) {
    state.active = true
    drainTransport(state)
  }
}

function waitForTransport(state: TransportState): Promise<void> {
  if (state.pending === 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    state.waiters.push(resolve)
  })
}

function closeTransport(state: TransportState): Promise<void> {
  if (state.closePromise) {
    return state.closePromise
  }

  state.accepting = false
  state.closePromise = (async () => {
    const errors: unknown[] = []
    await waitForTransport(state)

    try {
      await state.transport.flush?.()
    } catch (error) {
      errors.push(error)
    }

    try {
      await state.transport.close?.()
    } catch (error) {
      errors.push(error)
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, `${transportName(state.transport)} failed to close`)
    }
  })()

  return state.closePromise
}

/**
 * Logger class - Main API for logging messages.
 *
 * Writes to each transport are ordered and bounded. Call `flush()` before an
 * intentional process exit, and call `close()` when the logger is no longer needed.
 */
export class Logger {
  private levelState: LevelState
  private namespace?: string
  private transports: Transport[]
  private maxQueueSize: number
  private overflowStrategy: QueueOverflowStrategy
  private redaction: ResolvedRedaction | undefined
  private seenFailureCounts = new WeakMap<Transport, number>()
  private closed = false
  private closedDiagnosticWritten = false
  private closePromise?: Promise<void>

  constructor(options: LoggerOptions = {}) {
    this.levelState = { value: parseLevel(options.level ?? 'info') }
    if (options.namespace !== undefined) {
      this.namespace = options.namespace
    }
    this.transports = options.transports ?? [new ConsoleTransport()]
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE
    this.overflowStrategy = options.overflowStrategy ?? 'drop-newest'
    this.redaction = resolveRedaction(options.redact)

    if (!Number.isSafeInteger(this.maxQueueSize) || this.maxQueueSize < 1) {
      throw new RangeError('maxQueueSize must be a positive safe integer')
    }

    for (const transport of new Set(this.transports)) {
      this.seenFailureCounts.set(transport, getTransportState(transport).failureCount)
    }
  }

  /** Log a debug message with optional structured data. */
  debug(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, data)
  }

  /** Log an informational message with optional structured data. */
  info(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, data)
  }

  /** Log a warning message with optional structured data. */
  warn(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, data)
  }

  /** Log an error message. */
  error(message: string): void
  /** Log an error message with structured data. */
  error(message: string, data: Record<string, any>): void
  /** Log an Error or error-like value, with optional structured data. */
  error(message: string, error: ErrorLike | undefined, data?: Record<string, any>): void
  error(
    message: string,
    errorOrData?: ErrorLike | Record<string, any>,
    data?: Record<string, any>,
  ): void {
    if (!shouldLog(LogLevel.ERROR, this.levelState.value)) {
      return
    }

    let actualError: ErrorLike | undefined
    let actualData: Record<string, any> | undefined

    if (isErrorLike(errorOrData)) {
      actualError = errorOrData
      actualData = data
    } else {
      actualData = data ?? errorOrData
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level: LogLevelName[LogLevel.ERROR]!,
      message,
      ...(this.namespace !== undefined && { namespace: this.namespace }),
      ...(actualError !== undefined && { error: actualError }),
      ...(actualData !== undefined && { data: actualData }),
    }

    this.write(entry)
  }

  private log(level: LogLevel, message: string, data?: Record<string, any>): void {
    if (!shouldLog(level, this.levelState.value)) {
      return
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level: LogLevelName[level]!,
      message,
      ...(this.namespace !== undefined && { namespace: this.namespace }),
      ...(data !== undefined && { data }),
    }

    this.write(entry)
  }

  private write(entry: LogEntry): void {
    if (this.closed) {
      if (!this.closedDiagnosticWritten) {
        this.closedDiagnosticWritten = true
        writeDiagnostic('Logger is closed; subsequent entries will be dropped')
      }
      return
    }

    const transportEntry =
      this.redaction && entry.data
        ? { ...entry, data: redactData(entry.data, this.redaction) }
        : entry

    const overflowErrors: unknown[] = []
    for (const transport of this.transports) {
      try {
        enqueueWrite(
          transport,
          transportEntry,
          this.maxQueueSize,
          this.overflowStrategy,
        )
      } catch (error) {
        overflowErrors.push(error)
      }
    }

    if (overflowErrors.length > 0) {
      throw new AggregateError(overflowErrors, 'One or more transport queues are full')
    }
  }

  /** Create a logger that shares transport queues and adds a nested namespace. */
  child(namespace: string): Logger {
    const childNamespace = this.namespace ? `${this.namespace}:${namespace}` : namespace

    const child = new Logger({
      level: this.levelState.value,
      namespace: childNamespace,
      transports: this.transports,
      maxQueueSize: this.maxQueueSize,
      overflowStrategy: this.overflowStrategy,
    })
    child.levelState = this.levelState
    child.redaction = this.redaction
    return child
  }

  /** Set the minimum enabled log level. */
  setLevel(level: LogLevelInput): void {
    this.levelState.value = parseLevel(level)
  }

  /** Get the current minimum log level. */
  getLevel(): LogLevel {
    return this.levelState.value
  }

  /** Wait until all accepted writes have completed. */
  async flush(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise
    }

    const transports = [...new Set(this.transports)]
    const results = await Promise.allSettled(
      transports.map(async (transport) => {
        const state = getTransportState(transport)
        await waitForTransport(state)
        await transport.flush?.()
      }),
    )

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index]
      const transport = transports[index]
      if (result?.status === 'rejected' && transport) {
        const state = getTransportState(transport)
        recordFailure(state, result.reason)
        writeDiagnostic(`${transportName(transport)} flush failed: ${describeError(result.reason)}`)
      }
    }

    this.throwNewFailures(transports, 'One or more transport writes failed')
  }

  /** Flush pending writes and release transport-owned resources. */
  close(): Promise<void> {
    if (!this.closePromise) {
      this.closed = true
      this.closePromise = this.closeInternal()
    }
    return this.closePromise
  }

  private async closeInternal(): Promise<void> {
    const transports = [...new Set(this.transports)]
    const results = await Promise.allSettled(
      transports.map((transport) => closeTransport(getTransportState(transport))),
    )

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index]
      const transport = transports[index]
      if (result?.status === 'rejected' && transport) {
        const state = getTransportState(transport)
        recordFailure(state, result.reason)
        writeDiagnostic(`${transportName(transport)} close failed: ${describeError(result.reason)}`)
      }
    }

    this.throwNewFailures(transports, 'One or more transports failed to close')
  }

  private throwNewFailures(transports: Transport[], message: string): void {
    const errors: Error[] = []

    for (const transport of transports) {
      const state = getTransportState(transport)
      const seen = this.seenFailureCounts.get(transport) ?? 0
      const failures = state.failureCount - seen
      this.seenFailureCounts.set(transport, state.failureCount)

      if (failures > 0) {
        errors.push(
          new Error(
            `${transportName(transport)} failed ${String(failures)} ${failures === 1 ? 'write' : 'writes'}`,
            { cause: state.lastFailure },
          ),
        )
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, message)
    }
  }
}
