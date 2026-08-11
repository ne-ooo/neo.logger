import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: false,
  minify: false,
  target: 'es2022',
  footer: ({ format }) =>
    format === 'cjs'
      ? {
          js: `
const cjsExports = module.exports
module.exports = Object.assign(cjsExports.default, cjsExports)
`,
        }
      : undefined,
})
