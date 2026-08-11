import assert from 'node:assert/strict'
import logger, { createLogger } from '@lpm.dev/neo.logger'

assert.equal(typeof logger.info, 'function')
assert.equal(typeof createLogger, 'function')
