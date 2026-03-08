'use client'

import { create } from 'zustand'
import { AgentHandle } from '@shared/types'

interface AgentStoreState {
  readonly agents: AgentHandle[]
  readonly loading: boolean
  readonly error: string | null
  setAgents(agents: AgentHandle[]): void
  upsertAgent(agent: AgentHandle): void
  fetchAgents(): Promise<void>
}

function isAgentHandleArray(input: unknown): input is AgentHandle[] {
  return Array.isArray(input) && input.every((item) => typeof item === 'object' && item !== null && 'agentId' in item)
}

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,
  setAgents: (agents) => set({ agents }),
  upsertAgent: (agent) => {
    const existing = get().agents
    const next = existing.some((item) => item.agentId === agent.agentId)
      ? existing.map((item) => (item.agentId === agent.agentId ? agent : item))
      : [...existing, agent]
    set({ agents: next })
  },
  fetchAgents: async () => {
    set({ loading: true, error: null })
    try {
      const response = await fetch('/api/proxy/agents', { method: 'GET' })
      const payload = (await response.json()) as unknown
      if (!isAgentHandleArray(payload)) {
        throw new Error('Unexpected agent response shape')
      }
      set({ agents: payload, loading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch agents'
      set({ loading: false, error: message })
    }
  },
}))
