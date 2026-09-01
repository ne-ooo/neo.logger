import { types as utilTypes } from 'node:util'
import type { ErrorLike, LogEntry, FormatterOptions } from '../types.js'
import {
  escapeLogText,
  escapeUnsafeJsonCharacters,
  formatLogLines,
} from '../utils/sanitize.js'
import { isErrorLike } from '../utils/error.js'

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
}

const MAX_ERROR_SERIALIZATION_DEPTH = 64
const MAX_ERROR_SERIALIZATION_NODES = 10_000
const MAX_ERROR_PROTOTYPE_DEPTH = 64
const ERROR_SIZE_LIMIT_MARKER = '[Error size limit reached]'
const ERROR_METADATA_INSPECTION_MARKER = '[Unable to inspect error metadata safely]'
const ERROR_CONSTRUCTOR = Error
const ERROR_PROTOTYPE = ERROR_CONSTRUCTOR.prototype
const INITIAL_ERROR_PREPARE_STACK_TRACE = Object.getOwnPropertyDescriptor(
  ERROR_CONSTRUCTOR,
  'prepareStackTrace',
)
const NATIVE_ERROR_STACK_GETTER = Object.getOwnPropertyDescriptor(
  new ERROR_CONSTRUCTOR(),
  'stack',
)?.get
const DOM_EXCEPTION_PROTOTYPE = (
  globalThis as typeof globalThis & { DOMException?: { prototype: object } }
).DOMException?.prototype
const DOM_EXCEPTION_NAME_GETTER =
  DOM_EXCEPTION_PROTOTYPE === undefined
    ? undefined
    : Object.getOwnPropertyDescriptor(DOM_EXCEPTION_PROTOTYPE, 'name')?.get
const DOM_EXCEPTION_MESSAGE_GETTER =
  DOM_EXCEPTION_PROTOTYPE === undefined
    ? undefined
    : Object.getOwnPropertyDescriptor(DOM_EXCEPTION_PROTOTYPE, 'message')?.get

interface ErrorSerializationContext {
  active: WeakSet<object>
  preparedContainers: WeakMap<object, unknown>
  nodes: number
  exhausted: boolean
}

function createErrorSerializationContext(): ErrorSerializationContext {
  return {
    active: new WeakSet(),
    preparedContainers: new WeakMap(),
    nodes: 0,
    exhausted: false,
  }
}

function reserveErrorSerializationNodes(
  context: ErrorSerializationContext,
  count = 1,
): boolean {
  if (context.exhausted || count > MAX_ERROR_SERIALIZATION_NODES - context.nodes) {
    context.exhausted = true
    return false
  }
  context.nodes += count
  return true
}

function hasUnchangedErrorStackPreparation(): boolean {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(ERROR_CONSTRUCTOR, 'prepareStackTrace')
    if (INITIAL_ERROR_PREPARE_STACK_TRACE === undefined) {
      return descriptor === undefined
    }
    return (
      descriptor !== undefined &&
      'value' in INITIAL_ERROR_PREPARE_STACK_TRACE &&
      'value' in descriptor &&
      descriptor.value === INITIAL_ERROR_PREPARE_STACK_TRACE.value
    )
  } catch {
    return false
  }
}

function hasLocalErrorPrototype(error: ErrorLike): boolean {
  let current: object | null = error
  const visited = new Set<object>()
  let depth = 0

  while (current !== null && depth < MAX_ERROR_PROTOTYPE_DEPTH) {
    if (current === ERROR_PROTOTYPE) {
      return true
    }
    if (utilTypes.isProxy(current)) {
      return false
    }
    if (visited.has(current)) {
      return false
    }
    visited.add(current)
    depth += 1

    try {
      current = Object.getPrototypeOf(current) as object | null
    } catch {
      return false
    }
  }

  return false
}

function describeSerializationError(error: unknown): string {
  if (
    typeof error === 'string' ||
    typeof error === 'number' ||
    typeof error === 'bigint' ||
    typeof error === 'boolean' ||
    typeof error === 'symbol'
  ) {
    return String(error)
  }

  try {
    if (typeof error === 'object' && error !== null && utilTypes.isNativeError(error)) {
      const record = serializeErrorCore(error as ErrorLike)
      return typeof record.message === 'string' ? record.message : 'Unknown serialization error'
    }
  } catch {
    // Fall through to the inert marker.
  }
  return 'Unknown serialization error'
}

interface ErrorPropertyResult {
  found: boolean
  data: boolean
  accessor?: (() => unknown) | undefined
  value?: unknown
}

function readErrorDataProperty(error: ErrorLike, key: string): ErrorPropertyResult {
  let current: object | null = error
  const visited = new Set<object>()
  let depth = 0

  while (current !== null && depth < MAX_ERROR_PROTOTYPE_DEPTH) {
    if (utilTypes.isProxy(current)) {
      return { found: false, data: false }
    }
    if (visited.has(current)) {
      return { found: false, data: false }
    }
    visited.add(current)
    depth += 1

    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, key)
    } catch {
      return { found: false, data: false }
    }
    if (descriptor !== undefined) {
      return 'value' in descriptor
        ? { found: true, data: true, value: descriptor.value }
        : { found: true, data: false, accessor: descriptor.get }
    }

    try {
      current = Object.getPrototypeOf(current) as object | null
    } catch {
      return { found: false, data: false }
    }
  }

  return { found: false, data: false }
}

function serializeError(error: ErrorLike): Record<string, unknown> {
  const record = Object.create(null) as Record<string, unknown>

  const name = readErrorDataProperty(error, 'name')
  let nameValue = name.value
  if (name.found && !name.data && DOM_EXCEPTION_NAME_GETTER !== undefined) {
    try {
      nameValue = DOM_EXCEPTION_NAME_GETTER.call(error)
    } catch {
      // The getter's brand check rejects non-DOMException native errors.
    }
  }
  record.name = typeof nameValue === 'string' ? nameValue : 'Error'

  const message = readErrorDataProperty(error, 'message')
  let messageValue = message.value
  if (message.found && !message.data && DOM_EXCEPTION_MESSAGE_GETTER !== undefined) {
    try {
      messageValue = DOM_EXCEPTION_MESSAGE_GETTER.call(error)
    } catch {
      // The getter's brand check rejects non-DOMException native errors.
    }
  }
  record.message =
    typeof messageValue === 'string' ? messageValue : 'Unable to read error message'

  const stack = readErrorDataProperty(error, 'stack')
  if (typeof stack.value === 'string') {
    record.stack = stack.value
  } else if (stack.found) {
    const safeNameLookup =
      name.found &&
      ((name.data && typeof name.value === 'string') ||
        name.accessor === DOM_EXCEPTION_NAME_GETTER)
    const safeMessageLookup =
      message.found &&
      ((message.data && typeof message.value === 'string') ||
        message.accessor === DOM_EXCEPTION_MESSAGE_GETTER)
    try {
      record.stack =
        safeNameLookup &&
        safeMessageLookup &&
        hasUnchangedErrorStackPreparation() &&
        hasLocalErrorPrototype(error) &&
        utilTypes.isNativeError(error) &&
        NATIVE_ERROR_STACK_GETTER !== undefined
          ? NATIVE_ERROR_STACK_GETTER.call(error)
          : 'Unable to read error stack'
    } catch {
      record.stack = 'Unable to read error stack'
    }
  }

  const cause = readErrorDataProperty(error, 'cause')
  if (cause.found) {
    record.cause = cause.data ? cause.value : 'Unable to read error cause'
  }

  return record
}

function prepareErrorForSerialization(
  error: ErrorLike,
  origins: WeakMap<object, object>,
  context: ErrorSerializationContext = createErrorSerializationContext(),
  depth = 0,
): Record<string, unknown> | string {
  if (context.active.has(error)) {
    return '[Circular Error]'
  }
  if (depth >= MAX_ERROR_SERIALIZATION_DEPTH) {
    return '[Error depth limit reached]'
  }
  if (!reserveErrorSerializationNodes(context)) {
    return ERROR_SIZE_LIMIT_MARKER
  }

  context.active.add(error)
  const rawRecord = serializeError(error)
  const record = Object.create(null) as Record<string, unknown>
  origins.set(record, error)
  try {
    for (const key of Object.keys(rawRecord)) {
      record[key] = prepareErrorMetadataValue(rawRecord[key], origins, context, depth + 1)
      if (context.exhausted) {
        break
      }
    }

    if (!context.exhausted) {
      prepareEnumerableErrorMetadata(error, record, origins, context, depth + 1)
    }
  } finally {
    context.active.delete(error)
  }
  return record
}

function prepareEnumerableErrorMetadata(
  error: ErrorLike,
  record: Record<string, unknown>,
  origins: WeakMap<object, object>,
  context: ErrorSerializationContext,
  depth: number,
): void {
  let keys: string[]
  try {
    keys = Object.keys(error)
  } catch {
    record.serializationError = ERROR_METADATA_INSPECTION_MARKER
    return
  }

  const remaining = MAX_ERROR_SERIALIZATION_NODES - context.nodes
  if (keys.length > remaining + 5) {
    context.exhausted = true
    record.serializationTruncated = ERROR_SIZE_LIMIT_MARKER
    return
  }

  for (const key of keys) {
    if (key === 'toJSON' || Object.hasOwn(record, key)) {
      continue
    }

    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(error, key)
    } catch {
      record.serializationError = ERROR_METADATA_INSPECTION_MARKER
      return
    }
    if (descriptor === undefined || !descriptor.enumerable) {
      continue
    }

    record[key] =
      'value' in descriptor
        ? prepareErrorMetadataValue(descriptor.value, origins, context, depth)
        : reserveErrorSerializationNodes(context)
          ? '[Accessor]'
          : ERROR_SIZE_LIMIT_MARKER
    if (context.exhausted) {
      break
    }
  }
}

function prepareErrorMetadataValue(
  value: unknown,
  origins: WeakMap<object, object>,
  context: ErrorSerializationContext,
  depth: number,
): unknown {
  if (typeof value === 'object' && value !== null) {
    try {
      if (utilTypes.isNativeError(value)) {
        return prepareErrorForSerialization(value, origins, context, depth)
      }
    } catch {
      return ERROR_METADATA_INSPECTION_MARKER
    }
  }
  if (typeof value === 'function') {
    return reserveErrorSerializationNodes(context) ? undefined : ERROR_SIZE_LIMIT_MARKER
  }
  if (typeof value !== 'object' || value === null) {
    return reserveErrorSerializationNodes(context) ? value : ERROR_SIZE_LIMIT_MARKER
  }

  if (depth >= MAX_ERROR_SERIALIZATION_DEPTH) {
    return '[Error depth limit reached]'
  }
  if (!reserveErrorSerializationNodes(context)) {
    return ERROR_SIZE_LIMIT_MARKER
  }
  if (context.preparedContainers.has(value)) {
    return context.preparedContainers.get(value)
  }

  try {
    if (utilTypes.isDate(value)) {
      return new Date(Date.prototype.getTime.call(value))
    }
    if (utilTypes.isUint8Array(value) && Buffer.isBuffer(value)) {
      return Buffer.from(value)
    }
  } catch {
    return ERROR_METADATA_INSPECTION_MARKER
  }

  let arrayValue: boolean
  let arrayLength = 0
  try {
    arrayValue = Array.isArray(value)
    if (arrayValue) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
      if (
        lengthDescriptor === undefined ||
        !('value' in lengthDescriptor) ||
        typeof lengthDescriptor.value !== 'number' ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0
      ) {
        return ERROR_METADATA_INSPECTION_MARKER
      }
      arrayLength = lengthDescriptor.value
      if (!reserveErrorSerializationNodes(context, arrayLength)) {
        context.preparedContainers.set(value, ERROR_SIZE_LIMIT_MARKER)
        return ERROR_SIZE_LIMIT_MARKER
      }
    }
  } catch {
    return ERROR_METADATA_INSPECTION_MARKER
  }

  let keys: string[]
  try {
    keys = Object.keys(value)
  } catch {
    return ERROR_METADATA_INSPECTION_MARKER
  }

  if (!arrayValue && keys.length > MAX_ERROR_SERIALIZATION_NODES - context.nodes) {
    context.exhausted = true
    context.preparedContainers.set(value, ERROR_SIZE_LIMIT_MARKER)
    return ERROR_SIZE_LIMIT_MARKER
  }

  const prepared: unknown[] | Record<string, unknown> = arrayValue
    ? []
    : (Object.create(null) as Record<string, unknown>)
  context.preparedContainers.set(value, prepared)
  if (arrayValue) {
    prepared.length = arrayLength
  }

  for (const key of keys) {
    if (key === 'toJSON') {
      continue
    }
    if (arrayValue) {
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index >= arrayLength || String(index) !== key) {
        continue
      }
    }

    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key)
    } catch {
      Object.defineProperty(prepared, key, {
        value: ERROR_METADATA_INSPECTION_MARKER,
        enumerable: true,
        configurable: true,
        writable: true,
      })
      break
    }
    if (descriptor === undefined || !descriptor.enumerable) {
      continue
    }

    const preparedValue =
      'value' in descriptor
        ? prepareErrorMetadataValue(descriptor.value, origins, context, depth + 1)
        : reserveErrorSerializationNodes(context)
          ? '[Accessor]'
          : ERROR_SIZE_LIMIT_MARKER
    Object.defineProperty(prepared, key, {
      value: preparedValue,
      enumerable: true,
      configurable: true,
      writable: true,
    })
    if (context.exhausted) {
      break
    }
  }

  return prepared
}

function createSafeReplacer(
  preparedErrorOrigins: WeakMap<object, object> = new WeakMap(),
): (this: unknown, key: string, value: unknown) => unknown {
  const ancestors: object[] = []
  const activeErrors = new WeakSet<object>()
  const serializedErrorOrigins = new WeakMap<object, object>()

  return function safeReplacer(this: unknown, _key: string, value: unknown): unknown {
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      const ancestor = ancestors.pop()!
      const errorOrigin = serializedErrorOrigins.get(ancestor)
      if (errorOrigin !== undefined) {
        activeErrors.delete(errorOrigin)
      }
    }

    if (typeof value === 'bigint') {
      return value.toString()
    }

    if (typeof value === 'object' && value !== null) {
      const preparedOrigin = preparedErrorOrigins.get(value)
      if (preparedOrigin !== undefined) {
        if (activeErrors.has(preparedOrigin)) {
          return '[Circular Error]'
        }
        activeErrors.add(preparedOrigin)
        serializedErrorOrigins.set(value, preparedOrigin)
        ancestors.push(value)
        return value
      }
    }

    if (isErrorLike(value)) {
      if (activeErrors.has(value)) {
        return '[Circular Error]'
      }

      const serialized = prepareErrorForSerialization(value, preparedErrorOrigins)
      if (typeof serialized === 'string') {
        return serialized
      }
      activeErrors.add(value)
      serializedErrorOrigins.set(serialized, value)
      ancestors.push(serialized)
      return serialized
    }

    if (typeof value !== 'object' || value === null) {
      return value
    }

    if (ancestors.includes(value)) {
      return '[Circular]'
    }
    ancestors.push(value)
    return value
  }
}

function stringifySafely(
  value: unknown,
  preparedErrorOrigins?: WeakMap<object, object>,
): string {
  const result = JSON.stringify(value, createSafeReplacer(preparedErrorOrigins))
  return escapeUnsafeJsonCharacters(result ?? 'null')
}

function serializeErrorCore(error: ErrorLike): Record<string, unknown> {
  const record = serializeError(error)
  delete record.cause
  return record
}

function createSafeErrorSnapshot(error: ErrorLike): unknown {
  const preparedErrorOrigins = new WeakMap<object, object>()
  const preparedError = prepareErrorForSerialization(error, preparedErrorOrigins)
  try {
    return JSON.parse(stringifySafely(preparedError, preparedErrorOrigins)) as unknown
  } catch {
    return serializeErrorCore(error)
  }
}

function formatErrorForConsole(error: ErrorLike): string {
  const record = serializeErrorCore(error)
  const formatted = [record.stack, record.message, record.name].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  return formatLogLines(formatted ?? 'Error')
}

/**
 * Format log entry for console output (pretty, colored)
 *
 * @param entry - Log entry to format
 * @param options - Formatting options
 * @returns Formatted string for console output
 *
 * @example
 * ```typescript
 * const entry = {
 *   timestamp: Date.now(),
 *   level: 'info',
 *   message: 'Server started',
 *   data: { port: 3000 }
 * }
 * console.log(formatConsole(entry))
 * // 2024-01-15T10:30:45.123Z INFO  Server started { port: 3000 }
 * ```
 */
export function formatConsole(entry: LogEntry, options: FormatterOptions = {}): string {
  const { colors = true, timestamp = true } = options

  let output = ''

  // Timestamp
  if (timestamp) {
    const time = new Date(entry.timestamp).toISOString()
    output += colors ? `${COLORS.gray}${time}${COLORS.reset} ` : `${time} `
  }

  // Level with color
  const levelStr = escapeLogText(entry.level.toUpperCase()).padEnd(5)
  if (colors) {
    const color = getLevelColor(entry.level)
    output += `${color}${levelStr}${COLORS.reset} `
  } else {
    output += `${levelStr} `
  }

  // Namespace (if provided)
  if (entry.namespace) {
    const namespace = escapeLogText(entry.namespace)
    output += colors ? `${COLORS.cyan}[${namespace}]${COLORS.reset} ` : `[${namespace}] `
  }

  // Message
  output += escapeLogText(entry.message)

  // Extra fields
  if (entry.data) {
    let dataStr: string
    try {
      dataStr = stringifySafely(entry.data)
    } catch (error) {
      dataStr = stringifySafely(`[Unserializable data: ${describeSerializationError(error)}]`)
    }
    if (dataStr !== '{}') {
      output += colors ? ` ${COLORS.gray}${dataStr}${COLORS.reset}` : ` ${dataStr}`
    }
  }

  // Error stack
  if (entry.error) {
    output += `\n  | ${formatErrorForConsole(entry.error)}`
  }

  return output
}

/**
 * Format log entry as JSON (structured logging)
 *
 * @param entry - Log entry to format
 * @returns JSON string representing the log entry
 *
 * @example
 * ```typescript
 * const entry = {
 *   timestamp: Date.now(),
 *   level: 'error',
 *   message: 'Failed to connect',
 *   error: new Error('Connection refused')
 * }
 * console.log(formatJSON(entry))
 * // {"timestamp":1705318245123,"level":"error","message":"Failed to connect","error":{"message":"Connection refused",...}}
 * ```
 */
export function formatJSON(entry: LogEntry): string {
  const record: Record<string, unknown> = {
    timestamp: entry.timestamp,
    level: entry.level,
    message: entry.message,
  }

  if (entry.namespace) {
    record.namespace = entry.namespace
  }

  if (entry.data) {
    record.data = entry.data
  }

  let preparedErrorOrigins: WeakMap<object, object> | undefined
  if (entry.error) {
    preparedErrorOrigins = new WeakMap()
    record.error = prepareErrorForSerialization(entry.error, preparedErrorOrigins)
  }

  try {
    return stringifySafely(record, preparedErrorOrigins)
  } catch (error) {
    return stringifySafely({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      ...(entry.namespace !== undefined && { namespace: entry.namespace }),
      ...(entry.data !== undefined && { data: '[Unserializable data]' }),
      ...(entry.error !== undefined && { error: createSafeErrorSnapshot(entry.error) }),
      serializationError: describeSerializationError(error),
    })
  }
}

/**
 * Get ANSI color code for log level
 *
 * @param level - Log level name
 * @returns ANSI color code
 * @internal
 */
function getLevelColor(level: string): string {
  switch (level) {
    case 'debug':
      return COLORS.blue
    case 'info':
      return COLORS.cyan
    case 'warn':
      return COLORS.yellow
    case 'error':
      return COLORS.red
    default:
      return COLORS.reset
  }
}
