'use client'

import { useEffect } from 'react'
import { useAgentStore } from '@dashboard/stores/agentStore'

export function AgentsPage(): JSX.Element {
  const agents = useAgentStore((state) => state.agents)
  const fetchAgents = useAgentStore((state) => state.fetchAgents)

  useEffect(() => {
    void fetchAgents()
  }, [fetchAgents])

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Agents</h2>
      <div className="rounded border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left">Agent ID</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.agentId} className="border-b border-slate-100">
                <td className="px-4 py-2 font-mono text-xs">{agent.agentId}</td>
                <td className="px-4 py-2">{agent.roleName}</td>
                <td className="px-4 py-2">{agent.status}</td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={3}>
                  No agents available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
