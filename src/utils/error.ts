import type { ErrorLike } from '../types.js'

/** Recognize native, cross-realm, and safely identifiable serialized errors. */
export function isErrorLike(value: unknown): value is ErrorLike {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  try {
    if (value instanceof Error || Object.prototype.toString.call(value) === '[object Error]') {
      return true
    }

    const candidate = value as { message?: unknown; name?: unknown; stack?: unknown }
    if (typeof candidate.message !== 'string') {
      return false
    }

    return (
      typeof candidate.stack === 'string' ||
      (typeof candidate.name === 'string' && candidate.name.endsWith('Error'))
    )
  } catch {
    return false
  }
}
