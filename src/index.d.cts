type NeoLoggerModule = typeof import('./index.js')
type NeoLoggerNamedExports = Omit<NeoLoggerModule, 'default'>
type NeoLoggerCommonJS = NeoLoggerModule['default'] &
  NeoLoggerNamedExports & { default: NeoLoggerCommonJS }

declare const logger: NeoLoggerCommonJS

export = logger
