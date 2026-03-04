'use client'

import { create } from 'zustand'
import { SystemEvent } from '@shared/types'

interface EventStoreState {
  readonly events: SystemEvent[]
  readonly connected: boolean
  readonly error: string | null
  connect(url?: string): void
  disconnect(): void
  append(event: SystemEvent): void
}

type EventStoreInternal = EventStoreState & {
  socket: WebSocket | null
}

function isSystemEvent(input: unknown): input is SystemEvent {
  return typeof input === 'object' && input !== null && 'eventType' in input && 'timestamp' in input
}

export const useEventStore = create<EventStoreInternal>((set, get) => ({
  events: [],
  connected: false,
  error: null,
  socket: null,
  append: (event) => {
    set((state) => ({ events: [...state.events, event] }))
  },
  connect: (url) => {
    if (get().socket) {
      return
    }

    const targetUrl = url ?? process.env.NEXT_PUBLIC_EVENTS_WS_URL ?? 'ws://localhost:8787/events'
    const socket = new WebSocket(targetUrl)

    socket.onopen = () => {
      set({ connected: true, error: null })
    }
    socket.onclose = () => {
      set({ connected: false, socket: null })
    }
    socket.onerror = () => {
      set({ error: 'WebSocket error', connected: false })
    }
    socket.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data as string) as unknown
        if (isSystemEvent(parsed)) {
          get().append(parsed)
        }
      } catch {
        set({ error: 'Failed to parse event payload' })
      }
    }

    set({ socket })
  },
  disconnect: () => {
    const socket = get().socket
    if (!socket) {
      return
    }
    socket.close()
    set({ socket: null, connected: false })
  },
}))
