import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

  it('should wait for stream drain when stdout applies backpressure', async () => {
    stdoutSpy.mockReturnValueOnce(false)
    const transport = new ConsoleTransport()

    const write = transport.write(baseEntry)
    process.stdout.emit('drain')
    await write

    expect(stdoutSpy).toHaveBeenCalled()
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

  it('should write a batch in order', async () => {
    const transport = new FileTransport({ path: testFile })

    await transport.writeBatch([
      { ...baseEntry, message: 'First' },
      { ...baseEntry, message: 'Second' },
      { ...baseEntry, message: 'Third' },
    ])

    const lines = (await readFile(testFile, 'utf8')).trim().split('\n')
    expect(lines.map((line) => JSON.parse(line).message)).toEqual(['First', 'Second', 'Third'])
  })

  it('should append through a validated rotation descriptor when rotation is not needed', async () => {
    await writeFile(testFile, 'seed\n', { mode: 0o600 })
    const transport = new FileTransport({ path: testFile, rotate: true, maxSize: 1_000_000 })

    await transport.write(baseEntry)

    const content = await readFile(testFile, 'utf8')
    expect(content).toMatch(/^seed\n/)
    expect(content).toContain('Test message')
    expect(existsSync(`${testFile}.1`)).toBe(false)
  })

  it('should preserve rotation boundaries within a batch', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-batch-rotation-'))
    const path = join(directory, 'app.log')

    try {
      const transport = new FileTransport({ path, rotate: true, maxSize: 1, maxFiles: 3 })
      await transport.writeBatch([
        { ...baseEntry, message: 'First' },
        { ...baseEntry, message: 'Second' },
        { ...baseEntry, message: 'Third' },
      ])

      expect(await readFile(path, 'utf8')).toContain('Third')
      expect(await readFile(`${path}.1`, 'utf8')).toContain('Second')
      expect(await readFile(`${path}.2`, 'utf8')).toContain('First')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('should preserve concurrent writes during rotation across transport instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-rotation-'))
    const path = join(directory, 'app.log')

    try {
      await writeFile(path, 'seed\n', { mode: 0o600 })
      const first = new FileTransport({ path, rotate: true, maxSize: 1, maxFiles: 110 })
      const second = new FileTransport({ path, rotate: true, maxSize: 1, maxFiles: 110 })

      await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          (index % 2 === 0 ? first : second).write({
            timestamp: index,
            level: 'info',
            message: `message-${index}`,
          }),
        ),
      )

      const files = await readdir(directory)
      const contents = await Promise.all(files.map((file) => readFile(join(directory, file), 'utf8')))
      const output = contents.join('')

      for (let index = 0; index < 100; index += 1) {
        expect(output).toContain(`message-${index}`)
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('should create log files with owner-only permissions by default', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-mode-'))
    const path = join(directory, 'app.log')

    try {
      await new FileTransport({ path }).write(baseEntry)
      const fileStats = await stat(path)

      expect(fileStats.mode & 0o777).toBe(0o600)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('should reject pre-existing files with permissions above the configured mode', async () => {
    if (process.platform === 'win32') {
      return
    }

    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-permissive-mode-'))
    const path = join(directory, 'app.log')

    try {
      await writeFile(path, 'original\n', { mode: 0o600 })
      await chmod(path, 0o666)

      await expect(new FileTransport({ path }).write(baseEntry)).rejects.toMatchObject({
        code: 'EACCES',
        message: expect.stringContaining(
          'permissions 0o666 exceed configured maximum 0o600',
        ),
      })
      expect(await readFile(path, 'utf8')).toBe('original\n')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('should reject files not owned by the effective process user', async () => {
    if (process.platform === 'win32' || typeof process.geteuid !== 'function') {
      return
    }

    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-foreign-owner-'))
    const path = join(directory, 'app.log')
    const posixProcess = process as NodeJS.Process & { geteuid: () => number }
    const actualUserId = posixProcess.geteuid()
    const getUserId = vi.spyOn(posixProcess, 'geteuid').mockReturnValue(actualUserId + 1)

    try {
      await writeFile(path, 'original\n', { mode: 0o600 })

      await expect(new FileTransport({ path }).write(baseEntry)).rejects.toMatchObject({
        code: 'EPERM',
        message: expect.stringContaining(`target is owned by uid ${String(actualUserId)}`),
      })
      expect(await readFile(path, 'utf8')).toBe('original\n')
    } finally {
      getUserId.mockRestore()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('should reject non-regular targets before writing', async () => {
    if (process.platform === 'win32') {
      return
    }

    await expect(new FileTransport({ path: '/dev/null' }).write(baseEntry)).rejects.toMatchObject({
      code: 'EINVAL',
      message: expect.stringContaining('target is not a regular file'),
    })
  })

  it('should reject a directory before rotation can move it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-directory-target-'))
    const path = join(directory, 'app.log')

    try {
      await mkdir(path)
      await writeFile(join(path, 'important'), 'keep')

      await expect(
        new FileTransport({ path, rotate: true, maxSize: 1 }).write(baseEntry),
      ).rejects.toBeDefined()
      expect((await lstat(path)).isDirectory()).toBe(true)
      expect(await readFile(join(path, 'important'), 'utf8')).toBe('keep')
      expect(existsSync(`${path}.1`)).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('should reject final-component symlinks by default', async () => {
    if (process.platform === 'win32') {
      return
    }

    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-symlink-'))
    const target = join(directory, 'target.log')
    const path = join(directory, 'app.log')

    try {
      await writeFile(target, 'original\n')
      await symlink(target, path)

      await expect(
        new FileTransport({ path, rotate: true, maxSize: 1 }).write(baseEntry),
      ).rejects.toMatchObject({
        code: 'ELOOP',
      })
      expect(await readFile(target, 'utf8')).toBe('original\n')
      expect((await lstat(path)).isSymbolicLink()).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('should allow explicitly configured symlink destinations', async () => {
    if (process.platform === 'win32') {
      return
    }

    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-symlink-'))
    const target = join(directory, 'target.log')
    const path = join(directory, 'app.log')

    try {
      await writeFile(target, '', { mode: 0o600 })
      await symlink(target, path)
      await new FileTransport({ path, followSymlinks: true }).write(baseEntry)

      expect(await readFile(target, 'utf8')).toContain('Test message')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('should reject rotation through symbolic links', () => {
    expect(
      () => new FileTransport({ path: testFile, rotate: true, followSymlinks: true }),
    ).toThrow(/rotate and followSymlinks cannot both be enabled/)
  })

  it('should validate file creation modes', () => {
    expect(() => new FileTransport({ path: testFile, mode: -1 })).toThrow(RangeError)
    expect(() => new FileTransport({ path: testFile, mode: 0o1000 })).toThrow(RangeError)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'should reject invalid maxSize configuration %s',
    (maxSize) => {
      expect(() => new FileTransport({ path: testFile, maxSize })).toThrow(RangeError)
    },
  )

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_001])(
    'should reject invalid maxFiles configuration %s',
    (maxFiles) => {
      expect(() => new FileTransport({ path: testFile, maxFiles })).toThrow(RangeError)
    },
  )
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
