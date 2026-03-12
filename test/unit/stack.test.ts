import { describe, it, expect } from 'vitest'
import { parseStack, formatStack } from '../../src/utils/stack.js'
import type { StackFrame } from '../../src/utils/stack.js'

describe('parseStack', () => {
  it('returns empty array when error has no stack', () => {
    const error = new Error('no stack')
    error.stack = undefined
    const frames = parseStack(error)
    expect(frames).toEqual([])
  })

  it('returns empty array when stack has no frames', () => {
    const error = new Error('empty')
    error.stack = 'Error: empty\n'
    const frames = parseStack(error)
    expect(frames).toEqual([])
  })

  it('parses a simple named-function frame', () => {
    const error = new Error('test')
    error.stack = 'Error: test\n    at myFunction (app.ts:42:10)'
    const frames = parseStack(error)
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject<StackFrame>({
      function: 'myFunction',
      file: 'app.ts',
      line: 42,
      column: 10,
    })
  })

  it('parses an anonymous frame (no function name)', () => {
    const error = new Error('test')
    error.stack = 'Error: test\n    at /path/to/file.js:10:5'
    const frames = parseStack(error)
    expect(frames).toHaveLength(1)
    expect(frames[0]?.file).toBe('/path/to/file.js')
    expect(frames[0]?.line).toBe(10)
    expect(frames[0]?.column).toBe(5)
    expect(frames[0]?.function).toBeUndefined()
  })

  it('parses multiple frames', () => {
    const error = new Error('multi')
    error.stack = [
      'Error: multi',
      '    at first (a.ts:1:1)',
      '    at second (b.ts:2:2)',
      '    at third (c.ts:3:3)',
    ].join('\n')
    const frames = parseStack(error)
    expect(frames).toHaveLength(3)
    expect(frames[0]?.function).toBe('first')
    expect(frames[1]?.function).toBe('second')
    expect(frames[2]?.function).toBe('third')
  })

  it('parses real Error object stack', () => {
    const error = new Error('real error')
    const frames = parseStack(error)
    // Real stacks have at least one frame
    expect(frames.length).toBeGreaterThan(0)
    // Every frame should have a file
    for (const frame of frames) {
      expect(frame.file).toBeTruthy()
      expect(typeof frame.line).toBe('number')
      expect(typeof frame.column).toBe('number')
    }
  })

  it('parses line and column as integers', () => {
    const error = new Error('test')
    error.stack = 'Error: test\n    at fn (file.ts:100:20)'
    const [frame] = parseStack(error)
    expect(frame?.line).toBe(100)
    expect(frame?.column).toBe(20)
    expect(Number.isInteger(frame?.line)).toBe(true)
    expect(Number.isInteger(frame?.column)).toBe(true)
  })

  it('handles method name with dot notation', () => {
    const error = new Error('test')
    error.stack = 'Error: test\n    at Object.myMethod (module.ts:5:3)'
    const frames = parseStack(error)
    expect(frames[0]?.function).toBe('Object.myMethod')
  })
})

describe('formatStack', () => {
  it('returns empty string for error with no stack frames', () => {
    const error = new Error('empty')
    error.stack = 'Error: empty\n'
    const result = formatStack(error)
    expect(result).toBe('')
  })

  it('formats a single frame', () => {
    const error = new Error('test')
    error.stack = 'Error: test\n    at myFunction (app.ts:42:10)'
    const result = formatStack(error)
    expect(result).toBe('  at myFunction (app.ts:42:10)')
  })

  it('formats anonymous frame (no function)', () => {
    const error = new Error('test')
    error.stack = 'Error: test\n    at /path/to/file.js:10:5'
    const result = formatStack(error)
    expect(result).toBe('  at (/path/to/file.js:10:5)')
  })

  it('formats multiple frames joined by newlines', () => {
    const error = new Error('multi')
    error.stack = [
      'Error: multi',
      '    at first (a.ts:1:1)',
      '    at second (b.ts:2:2)',
    ].join('\n')
    const result = formatStack(error)
    const lines = result.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('  at first (a.ts:1:1)')
    expect(lines[1]).toBe('  at second (b.ts:2:2)')
  })

  it('each formatted line starts with "  at "', () => {
    const error = new Error('real')
    const result = formatStack(error)
    const lines = result.split('\n').filter(Boolean)
    for (const line of lines) {
      expect(line.startsWith('  at ')).toBe(true)
    }
  })

  it('formats real Error and returns non-empty string', () => {
    const error = new Error('real error')
    const result = formatStack(error)
    expect(result.length).toBeGreaterThan(0)
  })
})
