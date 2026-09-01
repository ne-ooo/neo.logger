import { types as utilTypes } from 'node:util'
import type { ErrorLike } from '../types.js'

/** Recognize native, cross-realm, and safely identifiable serialized errors. */
export function isErrorLike(value: unknown): value is ErrorLike {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  try {
    if (utilTypes.isNativeError(value)) {
      return true
    }

    const messageDescriptor = Object.getOwnPropertyDescriptor(value, 'message')
    if (messageDescriptor === undefined || !('value' in messageDescriptor)) {
      return false
    }
    if (typeof messageDescriptor.value !== 'string') {
      return false
    }

    const stackDescriptor = Object.getOwnPropertyDescriptor(value, 'stack')
    if (stackDescriptor !== undefined && 'value' in stackDescriptor) {
      return typeof stackDescriptor.value === 'string'
    }

    const nameDescriptor = Object.getOwnPropertyDescriptor(value, 'name')
    return (
      nameDescriptor !== undefined &&
      'value' in nameDescriptor &&
      typeof nameDescriptor.value === 'string' &&
      nameDescriptor.value.endsWith('Error')
    )
  } catch {
    return false
  }
}
