import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFile, unlink, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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
})
