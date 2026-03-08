'use client'

import { useMemo } from 'react'
import { useEventStore } from '@dashboard/stores/eventStore'

export function BusinessesPage(): JSX.Element {
  const events = useEventStore((state) => state.events)
  const provisionedBusinesses = useMemo(
    () => events.filter((event) => event.eventType === 'business.provisioned').length,
    [events],
  )

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Businesses</h2>
      <article className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">Provisioned (events)</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{provisionedBusinesses}</p>
        <p className="mt-2 text-sm text-slate-600">
          Dashboard remains read-only; all provisioning actions are performed by Jarvis + Mechanic.
        </p>
      </article>
    </section>
  )
}
