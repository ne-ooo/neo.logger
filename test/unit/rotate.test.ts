import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { lstat, mkdir, mkdtemp, writeFile, unlink, readFile, rm, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shouldRotate, rotateFiles } from '../../src/utils/rotate.js'

describe('shouldRotate', () => {
  const testFile = '/tmp/neo-logger-rotate-test.log'

  afterEach(async () => {
    if (existsSync(testFile)) {
      await unlink(testFile)
    }
  })

  it('should return false for non-existent file', async () => {
    const result = await shouldRotate('/tmp/does-not-exist.log', 1024)
    expect(result).toBe(false)
  })

  it('should return false if file is smaller than maxSize', async () => {
    await writeFile(testFile, 'small content')
    const result = await shouldRotate(testFile, 1024)
    expect(result).toBe(false)
  })

  it('should return true if file is larger than maxSize', async () => {
    const largeContent = 'x'.repeat(2000)
    await writeFile(testFile, largeContent)
    const result = await shouldRotate(testFile, 1024)
    expect(result).toBe(true)
  })

  it('should return true if file equals maxSize', async () => {
    const content = 'x'.repeat(1024)
    await writeFile(testFile, content)
    const result = await shouldRotate(testFile, 1024)
    expect(result).toBe(true)
  })

  it('should reject directories and symbolic links', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-should-rotate-target-'))
    const target = join(directory, 'target.log')
    const link = join(directory, 'app.log')

    try {
      await writeFile(target, 'content')
      await symlink(target, link)

      await expect(shouldRotate(directory, 1)).rejects.toMatchObject({ code: 'EINVAL' })
      await expect(shouldRotate(link, 1)).rejects.toMatchObject({ code: 'EINVAL' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'should reject invalid maxSize %s',
    async (maxSize) => {
      await expect(shouldRotate(testFile, maxSize)).rejects.toThrow(RangeError)
    },
  )
})

describe('rotateFiles', () => {
  const baseFile = '/tmp/neo-logger-rotate-base.log'

  beforeEach(async () => {
    // Clean up any existing files
    for (let i = 0; i <= 5; i++) {
      const file = i === 0 ? baseFile : `${baseFile}.${i}`
      if (existsSync(file)) {
        await unlink(file)
      }
    }
  })

  afterEach(async () => {
    // Clean up test files
    for (let i = 0; i <= 5; i++) {
      const file = i === 0 ? baseFile : `${baseFile}.${i}`
      if (existsSync(file)) {
        await unlink(file)
      }
    }
  })

  it('should rotate current file to .1', async () => {
    await writeFile(baseFile, 'current')
    await rotateFiles(baseFile, 3)

    expect(existsSync(baseFile)).toBe(false)
    expect(existsSync(`${baseFile}.1`)).toBe(true)

    const content = await readFile(`${baseFile}.1`, 'utf8')
    expect(content).toBe('current')
  })

  it('should rotate existing backup files', async () => {
    await writeFile(baseFile, 'current')
    await writeFile(`${baseFile}.1`, 'backup1')
    await writeFile(`${baseFile}.2`, 'backup2')

    await rotateFiles(baseFile, 5)

    const content1 = await readFile(`${baseFile}.1`, 'utf8')
    const content2 = await readFile(`${baseFile}.2`, 'utf8')
    const content3 = await readFile(`${baseFile}.3`, 'utf8')

    expect(content1).toBe('current')
    expect(content2).toBe('backup1')
    expect(content3).toBe('backup2')
  })

  it('should delete oldest file when maxFiles is reached', async () => {
    await writeFile(baseFile, 'current')
    await writeFile(`${baseFile}.1`, 'backup1')
    await writeFile(`${baseFile}.2`, 'backup2')
    await writeFile(`${baseFile}.3`, 'backup3')

    await rotateFiles(baseFile, 3)

    expect(existsSync(`${baseFile}.1`)).toBe(true)
    expect(existsSync(`${baseFile}.2`)).toBe(true)
    expect(existsSync(`${baseFile}.3`)).toBe(true)
    expect(existsSync(`${baseFile}.4`)).toBe(false)

    // Oldest file (original backup3) should be deleted
    const content3 = await readFile(`${baseFile}.3`, 'utf8')
    expect(content3).toBe('backup2')
  })

  it('should handle rotation when maxFiles is 1', async () => {
    await writeFile(baseFile, 'current')
    await rotateFiles(baseFile, 1)

    expect(existsSync(`${baseFile}.1`)).toBe(true)
    expect(existsSync(`${baseFile}.2`)).toBe(false)
  })

  it('should handle missing intermediate files', async () => {
    await writeFile(baseFile, 'current')
    await writeFile(`${baseFile}.3`, 'backup3')

    await rotateFiles(baseFile, 5)

    expect(existsSync(`${baseFile}.1`)).toBe(true)
    expect(existsSync(`${baseFile}.2`)).toBe(false)
    expect(existsSync(`${baseFile}.4`)).toBe(true)

    const content1 = await readFile(`${baseFile}.1`, 'utf8')
    const content4 = await readFile(`${baseFile}.4`, 'utf8')

    expect(content1).toBe('current')
    expect(content4).toBe('backup3')
  })

  it('should handle rotation when base file does not exist', async () => {
    await writeFile(`${baseFile}.1`, 'backup1')
    await rotateFiles(baseFile, 3)

    expect(existsSync(`${baseFile}.1`)).toBe(false)
    expect(existsSync(`${baseFile}.2`)).toBe(true)

    const content2 = await readFile(`${baseFile}.2`, 'utf8')
    expect(content2).toBe('backup1')
  })

  it('should rotate only existing numbered backups at high retention with gaps', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-sparse-rotation-'))
    const path = join(directory, 'app.log')

    try {
      await writeFile(path, 'current')
      await writeFile(`${path}.3`, 'backup3')
      await writeFile(`${path}.9999`, 'backup9999')
      await writeFile(`${path}.metadata`, 'metadata')

      await rotateFiles(path, 10_000)

      expect(await readFile(`${path}.1`, 'utf8')).toBe('current')
      expect(await readFile(`${path}.4`, 'utf8')).toBe('backup3')
      expect(await readFile(`${path}.10000`, 'utf8')).toBe('backup9999')
      expect(await readFile(`${path}.metadata`, 'utf8')).toBe('metadata')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('should tolerate a missing parent directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-missing-rotation-'))

    try {
      await expect(rotateFiles(join(directory, 'missing', 'app.log'), 10_000)).resolves.toBe(
        undefined,
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('should reject a directory target without moving it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-rotate-directory-'))
    const path = join(directory, 'app.log')

    try {
      await mkdir(path)
      await writeFile(join(path, 'important'), 'keep')

      await expect(rotateFiles(path, 3)).rejects.toMatchObject({ code: 'EINVAL' })
      expect((await lstat(path)).isDirectory()).toBe(true)
      expect(await readFile(join(path, 'important'), 'utf8')).toBe('keep')
      expect(existsSync(`${path}.1`)).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('should reject a non-regular backup before mutating retention files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'neo-logger-rotate-backup-'))
    const path = join(directory, 'app.log')

    try {
      await writeFile(path, 'current')
      await mkdir(`${path}.1`)
      await writeFile(join(`${path}.1`, 'important'), 'keep')

      await expect(rotateFiles(path, 3)).rejects.toMatchObject({ code: 'EINVAL' })
      expect(await readFile(path, 'utf8')).toBe('current')
      expect((await lstat(`${path}.1`)).isDirectory()).toBe(true)
      expect(await readFile(join(`${path}.1`, 'important'), 'utf8')).toBe('keep')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_001])(
    'should reject invalid maxFiles %s',
    async (maxFiles) => {
      await expect(rotateFiles(baseFile, maxFiles)).rejects.toThrow(RangeError)
    },
  )
})
