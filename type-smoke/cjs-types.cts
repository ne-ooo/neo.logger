import logger = require('@lpm.dev/neo.logger')

logger.info('CJS type smoke')
logger.default.info('CJS default type smoke')
logger.default.createLogger({ level: 'silent' })

const customLogger = logger.createLogger({ level: 'silent' })
customLogger.info('Custom logger type smoke')
