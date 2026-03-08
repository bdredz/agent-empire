import { serve } from '@hono/node-server'
import { loadConfig } from '@shared/config'
import { logger } from '@shared/logger'
import { createContainer } from './server/container'
import { createApp } from './server/createApp'
import { createStubGoalAnalyzer, createStubTaskExecutor } from './server/stubs'

const config = loadConfig()
const log = logger

const goalAnalyzer = createStubGoalAnalyzer()
const taskExecutor = createStubTaskExecutor()

const container = createContainer(goalAnalyzer, taskExecutor)
const app = createApp(container)

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info({ port: info.port }, 'Agent Empire API server started')
})

function shutdown(signal: string) {
  log.info({ signal }, 'Shutting down...')
  server.close(() => {
    log.info('Server closed')
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
