import { AgentStatus } from '@shared/types'

const statusCards: ReadonlyArray<{ label: string; value: AgentStatus }> = [
  { label: 'Ready', value: AgentStatus.Ready },
  { label: 'Busy', value: AgentStatus.Busy },
  { label: 'Paused', value: AgentStatus.Paused },
]

export function DashboardPage(): JSX.Element {
  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Control Plane</h2>
        <p className="text-sm text-slate-600">Read-only system overview sourced from Jarvis APIs.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {statusCards.map((card) => (
          <article key={card.value} className="rounded border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-lg font-medium text-slate-900">{card.value}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
