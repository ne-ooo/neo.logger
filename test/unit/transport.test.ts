import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { unlink, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { ConsoleTransport, FileTransport, CustomTransport } from '../../src/core/transport.js'
import type { LogEntry } from '../../src/types.js'

describe('ConsoleTransport', () => {
  let stdoutSpy: any
  let stderrSpy: any

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  })

  const baseEntry: LogEntry = {
    timestamp: Date.now(),
    level: 'info',
    message: 'Test message',
  }

  it('should write to stdout for info level', async () => {
    const transport = new ConsoleTransport({ stderr: true })
    await transport.write(baseEntry)

    expect(stdoutSpy).toHaveBeenCalled()
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('should write to stderr for warn level when stderr: true', async () => {
    const transport = new ConsoleTransport({ stderr: true })
    const warnEntry: LogEntry = { ...baseEntry, level: 'warn' }
    await transport.write(warnEntry)

    expect(stderrSpy).toHaveBeenCalled()
    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  it('should write to stderr for error level when stderr: true', async () => {
    const transport = new ConsoleTransport({ stderr: true })
    const errorEntry: LogEntry = { ...baseEntry, level: 'error' }
    await transport.write(errorEntry)

    expect(stderrSpy).toHaveBeenCalled()
    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  it('should write to stdout when stderr: false', async () => {
    const transport = new ConsoleTransport({ stderr: false })
    const errorEntry: LogEntry = { ...baseEntry, level: 'error' }
    await transport.write(errorEntry)

    expect(stdoutSpy).toHaveBeenCalled()
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('should append newline to output', async () => {
    const transport = new ConsoleTransport()
    await transport.write(baseEntry)

    const output = stdoutSpy.mock.calls[0][0]
    expect(output).toMatch(/\n$/)
  })
})

describe('FileTransport', () => {
  const testFile = '/tmp/neo-logger-test.log'

  afterEach(async () => {
    if (existsSync(testFile)) {
      await unlink(testFile)
    }
  })

  const baseEntry: LogEntry = {
    timestamp: Date.now(),
    level: 'info',
    message: 'Test message',
  }

  it('should write to file in JSON format by default', async () => {
    const transport = new FileTransport({ path: testFile })
    await transport.write(baseEntry)

    const content = await readFile(testFile, 'utf8')
    const parsed = JSON.parse(content.trim())

    expect(parsed.level).toBe('info')
    expect(parsed.message).toBe('Test message')
  })

  it('should write to file in text format when specified', async () => {
    const transport = new FileTransport({ path: testFile, format: 'text' })
    await transport.write(baseEntry)

    const content = await readFile(testFile, 'utf8')

    expect(content).toContain('INFO')
    expect(content).toContain('Test message')
  })

  it('should append multiple entries', async () => {
    const transport = new FileTransport({ path: testFile })

    await transport.write({ ...baseEntry, message: 'First' })
    await transport.write({ ...baseEntry, message: 'Second' })

    const content = await readFile(testFile, 'utf8')
    const lines = content.trim().split('\n')

    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!).message).toBe('First')
    expect(JSON.parse(lines[1]!).message).toBe('Second')
  })
})

describe('CustomTransport', () => {
  const baseEntry: LogEntry = {
    timestamp: Date.now(),
    level: 'info',
    message: 'Test message',
  }

  it('should call custom handler with log entry', async () => {
    const handler = vi.fn()
    const transport = new CustomTransport(handler)

    await transport.write(baseEntry)

    expect(handler).toHaveBeenCalledWith(baseEntry)
  })

  it('should handle async handlers', async () => {
    let called = false
    const handler = async (_entry: LogEntry) => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      called = true
    }

    const transport = new CustomTransport(handler)
    await transport.write(baseEntry)

    expect(called).toBe(true)
  })

  it('should handle sync handlers', async () => {
    let called = false
    const handler = (_entry: LogEntry) => {
      called = true
    }

    const transport = new CustomTransport(handler)
    await transport.write(baseEntry)

    expect(called).toBe(true)
  })
})
