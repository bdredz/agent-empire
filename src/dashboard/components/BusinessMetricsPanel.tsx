import React from 'react'
import { BusinessUnit } from '@shared/types'
import { TrendingUp, AlertTriangle, Users, Target } from 'lucide-react'

export interface BusinessMetricsPanelProps {
    business: BusinessUnit
}

export function BusinessMetricsPanel({ business }: BusinessMetricsPanelProps) {
    const { metrics } = business

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">{business.name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded capitalize border border-blue-100">
                            {business.type.replace('_', ' ')}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded capitalize border ${business.status === 'active' ? 'bg-green-50 text-green-700 border-green-100' :
                                business.status === 'paused' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                                    business.status === 'provisioning' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                        'bg-gray-50 text-gray-700 border-gray-100'
                            }`}>
                            {business.status}
                        </span>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm text-gray-500">Net Profit (30d)</p>
                    <p className={`text-2xl font-bold ${(metrics.revenue30d - metrics.costs30d) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${(metrics.revenue30d - metrics.costs30d).toFixed(2)}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-1">
                        <TrendingUp className="w-4 h-4" /> Revenue
                    </div>
                    <div className="text-xl font-bold text-gray-900">${metrics.revenue30d.toFixed(2)}</div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-1">
                        <Target className="w-4 h-4" /> Costs
                    </div>
                    <div className="text-xl font-bold text-gray-900">${metrics.costs30d.toFixed(2)}</div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-1">
                        <AlertTriangle className={`w-4 h-4 ${metrics.failureRate > 0.1 ? 'text-red-500' : ''}`} /> Failure Rate
                    </div>
                    <div className={`text-xl font-bold ${metrics.failureRate > 0.1 ? 'text-red-600' : 'text-gray-900'}`}>
                        {(metrics.failureRate * 100).toFixed(1)}%
                    </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-1">
                        <Users className="w-4 h-4" /> Active Agents
                    </div>
                    <div className="text-xl font-bold text-gray-900">{metrics.activeAgents}</div>
                </div>
            </div>
        </div>
    )
}
