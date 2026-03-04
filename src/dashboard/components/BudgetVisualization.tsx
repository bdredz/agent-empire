import React from 'react'
import { BusinessUnit, AgentHandle } from '@shared/types'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts'
import { Wallet, TrendingUp } from 'lucide-react'

export interface BudgetVisualizationProps {
    businesses: BusinessUnit[]
    agents: AgentHandle[]
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280']

export function BudgetVisualization({ businesses, agents }: BudgetVisualizationProps) {
    // Aggregate revenue and cost by business
    const businessData = businesses.map(b => ({
        name: b.name,
        Revenue: b.metrics.revenue30d,
        Cost: b.metrics.costs30d,
        Profit: b.metrics.revenue30d - b.metrics.costs30d,
    }))

    // Aggregate cost units by agent role
    const costByRole = agents.reduce((acc, agent) => {
        const role = agent.roleName
        // Fake usage calculation if agent usage isn't embedded directly in AgentHandle but we want visualization
        // Here we'll just sum budgetAllocated.maxCostUnits for demo. In a real app we'd pass BudgetUsage map.
        const cost = agent.budgetAllocated.maxCostUnits || 0
        acc[role] = (acc[role] || 0) + cost
        return acc
    }, {} as Record<string, number>)

    const agentRoleData = Object.entries(costByRole).map(([name, value]) => ({
        name,
        value,
    }))

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-blue-600" />
                    Financial & Budget Overview
                </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Bar Chart: Revenue vs Cost by Business */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-500" />
                        30-Day Revenue vs Cost (by Business Unit)
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={businessData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                                <Tooltip
                                    cursor={{ fill: '#F3F4F6' }}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                    formatter={(value) => [`$${Number(value).toFixed(2)}`, undefined]}
                                />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                <Bar dataKey="Revenue" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                <Bar dataKey="Cost" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Pie Chart: Budget Allocation by Agent Role */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-purple-500" />
                        Budget Allocated (by Agent Role)
                    </h3>
                    <div className="h-64 relative">
                        {agentRoleData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                        formatter={(value) => [`$${Number(value).toFixed(2)} cost units`, 'Budget']}
                                    />
                                    <Legend iconType="circle" layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px' }} />
                                    <Pie
                                        data={agentRoleData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {agentRoleData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm italic">
                                No active agents to display
                            </div>
                        )}

                        {/* Center label for pie chart */}
                        {agentRoleData.length > 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none pr-[120px]">
                                <div className="text-center">
                                    <p className="text-xs text-gray-500 font-medium">Total</p>
                                    <p className="text-lg font-bold text-gray-900">
                                        ${agentRoleData.reduce((sum, item) => sum + item.value, 0).toFixed(0)}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
