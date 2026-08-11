const assert = require('node:assert/strict')
const logger = require('@lpm.dev/neo.logger')

assert.equal(typeof logger.info, 'function')
assert.equal(typeof logger.createLogger, 'function')
assert.equal(logger.default, logger)
