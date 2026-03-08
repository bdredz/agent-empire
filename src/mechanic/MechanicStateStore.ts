import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { BusinessUnit, SystemEvent } from '@shared/types'

export interface MechanicState {
  businesses: Record<string, BusinessUnit>
  events: SystemEvent[]
}

const EMPTY_STATE: MechanicState = { businesses: {}, events: [] }

export class MechanicStateStore {
  constructor(private readonly filePath: string) {}

  public read(): MechanicState {
    if (!existsSync(this.filePath)) {
      return EMPTY_STATE
    }

    return JSON.parse(readFileSync(this.filePath, 'utf-8')) as MechanicState
  }

  public write(state: MechanicState): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8')
  }
}
