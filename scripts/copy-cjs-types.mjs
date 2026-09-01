import { copyFile } from 'node:fs/promises'

await copyFile('src/index.d.cts', 'dist/index.d.cts')
