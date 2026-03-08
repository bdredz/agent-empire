import pino from 'pino'

export const logger = pino({
  name: 'agent-empire',
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
})

export function createChildLogger(module: string) {
  return logger.child({ module })
}
