import React from 'react'
import { AgentHandle, BudgetUsage, AgentStatus } from '@shared/types'
import { Activity, CheckCircle2, AlertCircle, PauseCircle, XCircle } from 'lucide-react'

export interface AgentStatusCardProps {
    agent: AgentHandle
    usage: BudgetUsage
}

export function AgentStatusCard({ agent, usage }: AgentStatusCardProps) {
    const getStatusIcon = (status: string) => {
        switch (status) {
            case AgentStatus.Ready:
                return <CheckCircle2 className="w-5 h-5 text-green-500" />
            case AgentStatus.Busy:
                return <Activity className="w-5 h-5 text-blue-500 animate-pulse" />
            case AgentStatus.Error:
                return <AlertCircle className="w-5 h-5 text-red-500" />
            case AgentStatus.Paused:
                return <PauseCircle className="w-5 h-5 text-yellow-500" />
            case AgentStatus.Terminated:
                return <XCircle className="w-5 h-5 text-gray-500" />
            default:
                return <Activity className="w-5 h-5 text-gray-400" />
        }
    }

    const budgetMax = agent.budgetAllocated.maxCostUnits || 100
    const budgetUsagePercent = Math.min((usage.costUnitsUsed / budgetMax) * 100, 100)

    const tokenMax = agent.budgetAllocated.maxTokens || 100000
    const tokenUsagePercent = Math.min((usage.tokensUsed / tokenMax) * 100, 100)

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 capitalize flex items-center gap-2">
                        {agent.roleName}
                        {getStatusIcon(agent.status)}
                    </h3>
                    <p className="text-sm text-gray-500 font-mono mt-1 w-full truncate max-w-[200px]">
                        {agent.agentId}
                    </p>
                </div>
                <div className="px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-600 capitalize">
                    {agent.modelTier}
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium">Budget Usage</span>
                        <span className="text-gray-800">${usage.costUnitsUsed.toFixed(2)} / ${budgetMax.toFixed(2)}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${budgetUsagePercent > 90 ? 'bg-red-500' : budgetUsagePercent > 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${budgetUsagePercent}%` }}
                        />
                    </div>
                </div>

                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium">Token Usage</span>
                        <span className="text-gray-800">{(usage.tokensUsed / 1000).toFixed(1)}k / {(tokenMax / 1000).toFixed(1)}k</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${tokenUsagePercent > 90 ? 'bg-red-500' : tokenUsagePercent > 75 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                            style={{ width: `${tokenUsagePercent}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
