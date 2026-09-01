import { types as utilTypes } from 'node:util'
import type { RedactionConfig, RedactionOptions } from '../types.js'

const DEFAULT_CENSOR = '[REDACTED]'
const CIRCULAR_MARKER = '[Circular]'
const REDACTION_SIZE_LIMIT_MARKER = '[Redaction size limit reached]'
const REDACTION_INSPECTION_MARKER = '[Unable to inspect object safely]'
const MAX_REDACTION_DEPTH = 64
const MAX_REDACTION_NODES = 10_000
const MAX_ERROR_PROTOTYPE_DEPTH = 64
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
const REGEXP_SOURCE_GETTER = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source')?.get
const REGEXP_FLAGS = [
  ['hasIndices', 'd'],
  ['global', 'g'],
  ['ignoreCase', 'i'],
  ['multiline', 'm'],
  ['dotAll', 's'],
  ['unicode', 'u'],
  ['unicodeSets', 'v'],
  ['sticky', 'y'],
] as const

const DEFAULT_REDACTION_PATHS = [
  '**.password',
  '**.passwd',
  '**.passphrase',
  '**.secret',
  '**.token',
  '**.accessToken',
  '**.access_token',
  '**.refreshToken',
  '**.refresh_token',
  '**.apiKey',
  '**.api_key',
  '**.clientSecret',
  '**.client_secret',
  '**.authorization',
  '**.proxy-authorization',
  '**.cookie',
  '**.set-cookie',
  '**.sessionId',
  '**.session_id',
] as const

export interface ResolvedRedaction {
  patterns: string[][]
  recursiveLeafKeys: ReadonlySet<string>
  censor: string
}

interface RedactionContext {
  active: WeakSet<object>
  nodes: number
  exhausted: boolean
}

function reserveRedactionNodes(context: RedactionContext, count = 1): boolean {
  if (context.exhausted || count > MAX_REDACTION_NODES - context.nodes) {
    context.exhausted = true
    return false
  }
  context.nodes += count
  return true
}

function compilePath(path: string): string[] {
  const result: string[] = []

  for (const rawSegment of path.split('.')) {
    const segment = rawSegment.trim().toLowerCase()
    if (!segment || (segment === '**' && result[result.length - 1] === '**')) {
      continue
    }
    result.push(segment)
  }

  return result
}

function compilePaths(paths: readonly string[]): {
  patterns: string[][]
  recursiveLeafKeys: ReadonlySet<string>
} {
  const patterns: string[][] = []
  const recursiveLeafKeys = new Set<string>()

  for (const path of paths) {
    const segments = compilePath(path)
    if (segments.length === 0) {
      continue
    }

    if (
      segments.length === 2 &&
      segments[0] === '**' &&
      segments[1] !== '*' &&
      segments[1] !== '**'
    ) {
      recursiveLeafKeys.add(segments[1]!)
    } else {
      patterns.push(segments)
    }
  }

  return { patterns, recursiveLeafKeys }
}

export function resolveRedaction(config: RedactionConfig | undefined): ResolvedRedaction | undefined {
  if (config === undefined) {
    return undefined
  }

  let paths: readonly string[]
  let censor = DEFAULT_CENSOR

  if (config === true) {
    paths = DEFAULT_REDACTION_PATHS
  } else if (Array.isArray(config)) {
    paths = config
  } else {
    const options = config as RedactionOptions
    paths = options.paths
    censor = options.censor ?? DEFAULT_CENSOR
  }

  const { patterns, recursiveLeafKeys } = compilePaths(paths)
  return patterns.length === 0 && recursiveLeafKeys.size === 0
    ? undefined
    : { patterns, recursiveLeafKeys, censor }
}

/** Match `*` as one segment and `**` as zero or more without recursive backtracking. */
function matchesPattern(pattern: readonly string[], path: readonly string[]): boolean {
  let patternIndex = 0
  let pathIndex = 0
  let globstarIndex = -1
  let globstarPathIndex = -1

  while (pathIndex < path.length) {
    const segment = pattern[patternIndex]
    if (segment === '**') {
      globstarIndex = patternIndex
      globstarPathIndex = pathIndex
      patternIndex += 1
      continue
    }

    if (segment !== undefined && (segment === '*' || segment === path[pathIndex])) {
      patternIndex += 1
      pathIndex += 1
      continue
    }

    if (globstarIndex === -1) {
      return false
    }

    patternIndex = globstarIndex + 1
    globstarPathIndex += 1
    pathIndex = globstarPathIndex
  }

  while (pattern[patternIndex] === '**') {
    patternIndex += 1
  }
  return patternIndex === pattern.length
}

function shouldRedact(path: readonly string[], key: string, redaction: ResolvedRedaction): boolean {
  if (redaction.recursiveLeafKeys.has(key)) {
    return true
  }
  return redaction.patterns.some((pattern) => matchesPattern(pattern, path))
}

function defineValue(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  })
}

function findErrorDescriptor(
  value: object,
  key: string,
): PropertyDescriptor | undefined {
  let prototype: object | null = value

  const visited = new Set<object>()
  let prototypeDepth = 0

  while (prototype !== null && prototypeDepth < MAX_ERROR_PROTOTYPE_DEPTH) {
    if (utilTypes.isProxy(prototype)) {
      return undefined
    }
    if (visited.has(prototype)) {
      return undefined
    }
    visited.add(prototype)
    prototypeDepth += 1

    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(prototype, key)
    } catch {
      return undefined
    }
    if (descriptor !== undefined) {
      return descriptor
    }

    try {
      prototype = Object.getPrototypeOf(prototype) as object | null
    } catch {
      return undefined
    }
  }

  return undefined
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

function hasLocalErrorPrototype(value: object): boolean {
  let current: object | null = value
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

function hasSafeErrorStringProperty(
  value: object,
  key: string,
  trustedGetter: (() => unknown) | undefined,
): boolean {
  const descriptor = findErrorDescriptor(value, key)
  if (descriptor === undefined) {
    return false
  }
  return 'value' in descriptor
    ? typeof descriptor.value === 'string'
    : descriptor.get !== undefined && descriptor.get === trustedGetter
}

function getTrustedErrorAccessor(
  value: object,
  key: string,
  descriptor: PropertyDescriptor,
): (() => unknown) | undefined {
  if ('value' in descriptor || descriptor.get === undefined) {
    return undefined
  }
  if (key === 'name' && descriptor.get === DOM_EXCEPTION_NAME_GETTER) {
    return DOM_EXCEPTION_NAME_GETTER
  }
  if (key === 'message' && descriptor.get === DOM_EXCEPTION_MESSAGE_GETTER) {
    return DOM_EXCEPTION_MESSAGE_GETTER
  }
  if (
    key === 'stack' &&
    NATIVE_ERROR_STACK_GETTER !== undefined &&
    hasUnchangedErrorStackPreparation() &&
    hasLocalErrorPrototype(value) &&
    hasSafeErrorStringProperty(value, 'name', DOM_EXCEPTION_NAME_GETTER) &&
    hasSafeErrorStringProperty(value, 'message', DOM_EXCEPTION_MESSAGE_GETTER)
  ) {
    return NATIVE_ERROR_STACK_GETTER
  }
  return undefined
}

function cloneProperty(
  target: object,
  source: object,
  key: string,
  descriptor: PropertyDescriptor,
  path: string[],
  depth: number,
  redaction: ResolvedRedaction,
  context: RedactionContext,
  accessorGetter?: (() => unknown) | undefined,
): void {
  if (!reserveRedactionNodes(context)) {
    defineValue(target, key, REDACTION_SIZE_LIMIT_MARKER)
    return
  }

  const normalizedKey = key.toLowerCase()
  path.push(normalizedKey)
  try {
    if (shouldRedact(path, normalizedKey, redaction)) {
      defineValue(target, key, redaction.censor)
    } else if ('value' in descriptor) {
      defineValue(
        target,
        key,
        cloneAndRedact(descriptor.value, path, depth + 1, redaction, context),
      )
    } else if (accessorGetter !== undefined) {
      let accessorValue: unknown
      try {
        accessorValue = accessorGetter.call(source)
      } catch {
        accessorValue = `[Unable to read error ${key}]`
      }
      defineValue(
        target,
        key,
        cloneAndRedact(accessorValue, path, depth + 1, redaction, context),
      )
    } else {
      defineValue(target, key, '[Accessor]')
    }
  } finally {
    path.pop()
  }
}

function createTarget(arrayValue: boolean): object {
  return arrayValue ? [] : (Object.create(null) as Record<string, unknown>)
}

function cloneRegExp(value: RegExp): RegExp {
  const source = REGEXP_SOURCE_GETTER?.call(value)
  if (typeof source !== 'string') {
    throw new TypeError('Unable to read RegExp source safely')
  }

  let flags = ''
  for (const [property, flag] of REGEXP_FLAGS) {
    const getter = Object.getOwnPropertyDescriptor(RegExp.prototype, property)?.get
    if (getter?.call(value) === true) {
      flags += flag
    }
  }
  return new RegExp(source, flags)
}

function cloneAndRedact(
  value: unknown,
  path: string[],
  depth: number,
  redaction: ResolvedRedaction,
  context: RedactionContext,
): unknown {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return value
  }

  const objectValue = value as object
  if (context.active.has(objectValue)) {
    return CIRCULAR_MARKER
  }
  if (depth >= MAX_REDACTION_DEPTH) {
    return '[Redaction depth limit reached]'
  }

  if (!reserveRedactionNodes(context)) {
    return REDACTION_SIZE_LIMIT_MARKER
  }

  try {
    if (utilTypes.isDate(value)) {
      return new Date(Date.prototype.getTime.call(value))
    }
    if (utilTypes.isRegExp(value)) {
      return cloneRegExp(value)
    }
    if (utilTypes.isUint8Array(value) && Buffer.isBuffer(value)) {
      return Buffer.from(value)
    }
  } catch {
    return '[Unable to inspect built-in value safely]'
  }

  let nativeError = false
  try {
    nativeError = utilTypes.isNativeError(value)
  } catch {
    // Treat hostile proxies as ordinary objects and inspect descriptors below.
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
        const target = createTarget(false)
        defineValue(target, 'redactionError', REDACTION_INSPECTION_MARKER)
        return target
      }
      arrayLength = lengthDescriptor.value
      if (!reserveRedactionNodes(context, arrayLength)) {
        return REDACTION_SIZE_LIMIT_MARKER
      }
    }
  } catch {
    const target = createTarget(false)
    defineValue(target, 'redactionError', '[Unable to inspect object safely]')
    return target
  }

  let keys: string[]
  try {
    keys = Object.keys(value)
  } catch {
    const target = createTarget(false)
    defineValue(target, 'redactionError', REDACTION_INSPECTION_MARKER)
    return target
  }

  if (!arrayValue && !nativeError && keys.length > MAX_REDACTION_NODES - context.nodes) {
    context.exhausted = true
    return REDACTION_SIZE_LIMIT_MARKER
  }

  const target = createTarget(arrayValue)
  if (arrayValue) {
    ;(target as unknown[]).length = arrayLength
  }

  context.active.add(objectValue)
  try {
    const handledKeys = nativeError ? new Set<string>() : undefined
    if (nativeError) {
      for (const key of ['name', 'message', 'stack', 'cause']) {
        const descriptor = findErrorDescriptor(objectValue, key)
        if (descriptor !== undefined) {
          cloneProperty(
            target,
            objectValue,
            key,
            descriptor,
            path,
            depth,
            redaction,
            context,
            getTrustedErrorAccessor(objectValue, key, descriptor),
          )
          handledKeys!.add(key)
          if (context.exhausted) {
            break
          }
        }
      }
    }

    if (
      !context.exhausted &&
      nativeError &&
      keys.length > MAX_REDACTION_NODES - context.nodes + 4
    ) {
      defineValue(target, 'redactionTruncated', REDACTION_SIZE_LIMIT_MARKER)
      context.exhausted = true
    }

    for (const key of keys) {
      if (context.exhausted) {
        break
      }
      if (handledKeys?.has(key)) {
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
        defineValue(target, arrayValue ? key : 'redactionError', REDACTION_INSPECTION_MARKER)
        break
      }
      if (descriptor === undefined || !descriptor.enumerable) {
        continue
      }
      cloneProperty(target, objectValue, key, descriptor, path, depth, redaction, context)
    }
  } finally {
    context.active.delete(objectValue)
  }

  return target
}

/** Create a path-specific redacted snapshot for transport delivery. */
export function redactData(
  data: Record<string, any>,
  redaction: ResolvedRedaction,
): Record<string, any> {
  const context: RedactionContext = { active: new WeakSet(), nodes: 0, exhausted: false }
  const result = cloneAndRedact(data, [], 0, redaction, context)

  if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
    return result as Record<string, any>
  }

  const fallback = Object.create(null) as Record<string, any>
  fallback.value = result
  return fallback
}
