import type { RedactionConfig, RedactionOptions } from '../types.js'

const DEFAULT_CENSOR = '[REDACTED]'
const MAX_REDACTION_DEPTH = 64
const MAX_REDACTION_NODES = 10_000

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
  censor: string
}

interface RedactionContext {
  seen: WeakMap<object, unknown>
  nodes: number
}

function compilePaths(paths: readonly string[]): string[][] {
  return paths
    .map((path) => path.split('.').map((segment) => segment.trim()).filter(Boolean))
    .filter((segments) => segments.length > 0)
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

  const patterns = compilePaths(paths)
  return patterns.length === 0 ? undefined : { patterns, censor }
}

function matchesPattern(pattern: string[], path: string[], patternIndex = 0, pathIndex = 0): boolean {
  if (patternIndex === pattern.length) {
    return pathIndex === path.length
  }

  const segment = pattern[patternIndex]!
  if (segment === '**') {
    return (
      matchesPattern(pattern, path, patternIndex + 1, pathIndex) ||
      (pathIndex < path.length && matchesPattern(pattern, path, patternIndex, pathIndex + 1))
    )
  }

  if (pathIndex >= path.length) {
    return false
  }

  return (
    (segment === '*' || segment.toLowerCase() === path[pathIndex]!.toLowerCase()) &&
    matchesPattern(pattern, path, patternIndex + 1, pathIndex + 1)
  )
}

function shouldRedact(path: string[], redaction: ResolvedRedaction): boolean {
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
  const existing = context.seen.get(objectValue)
  if (existing !== undefined) {
    return existing
  }

  if (depth >= MAX_REDACTION_DEPTH) {
    return '[Redaction depth limit reached]'
  }
  context.nodes += 1
  if (context.nodes > MAX_REDACTION_NODES) {
    return '[Redaction size limit reached]'
  }

  if (value instanceof Date) {
    return new Date(value.getTime())
  }
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags)
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value)
  }

  const target: unknown[] | Record<string, unknown> = Array.isArray(value)
    ? []
    : (Object.create(null) as Record<string, unknown>)
  context.seen.set(objectValue, target)

  let descriptors: Record<string, PropertyDescriptor>
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    defineValue(target, 'redactionError', '[Unable to inspect object safely]')
    return target
  }

  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable) {
      continue
    }

    const propertyPath = [...path, key]
    if (shouldRedact(propertyPath, redaction)) {
      defineValue(target, key, redaction.censor)
      continue
    }

    if ('value' in descriptor) {
      defineValue(
        target,
        key,
        cloneAndRedact(descriptor.value, propertyPath, depth + 1, redaction, context),
      )
    } else {
      defineValue(target, key, '[Accessor]')
    }
  }

  return target
}

/** Create a redacted snapshot so no transport can observe the original sensitive values. */
export function redactData(
  data: Record<string, any>,
  redaction: ResolvedRedaction,
): Record<string, any> {
  const context: RedactionContext = { seen: new WeakMap(), nodes: 0 }
  const result = cloneAndRedact(data, [], 0, redaction, context)

  if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
    return result as Record<string, any>
  }

  const fallback = Object.create(null) as Record<string, any>
  fallback.value = result
  return fallback
}
