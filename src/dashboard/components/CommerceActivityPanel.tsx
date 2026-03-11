import React from 'react'
import {
    CommerceEvent,
    CommerceQuote,
    TreasuryBalance,
    CommerceReceipt,
    CommerceRail
} from '@shared/types'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export interface CommerceActivityPanelProps {
    transactions: CommerceReceipt[]
    quotes: CommerceQuote[]
    treasuryBalances: TreasuryBalance[]
    events: CommerceEvent[] // feed of events like refund/credit
    settlementStatus: 'reconciled' | 'pending' | 'discrepancy'
}

const getTransactionBadge = (status: CommerceReceipt['status']) => {
    switch (status) {
        case 'settled':
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Settled</span>
        case 'pending':
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending</span>
        case 'failed':
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Failed</span>
        case 'refunded':
        case 'credited':
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 capitalize">{status}</span>
        default:
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 capitalize">{status}</span>
    }
}

const RAIL_COLORS: Record<string, string> = {
    stripe: '#6366f1',
    x402: '#10b981',
    mcp_pay: '#f59e0b',
    coinbase_wallet: '#3b82f6',
}

export function CommerceActivityPanel({
    transactions,
    quotes,
    treasuryBalances,
    events,
    settlementStatus
}: CommerceActivityPanelProps) {

    const activeQuotes = quotes.filter(q => new Date(q.expiresAt).getTime() > Date.now())
    const recentEvents = [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 15)
    
    // Process rails data for PieChart
    const railData = Object.entries(
        transactions.reduce((acc, tx) => {
            acc[tx.rail] = (acc[tx.rail] || 0) + tx.amount
            return acc
        }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value }))

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-gray-900">Commerce Activity</h1>
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500 font-medium">Reconciliation:</span>
                    {settlementStatus === 'reconciled' && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Reconciled</span>}
                    {settlementStatus === 'pending' && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 animate-pulse">Pending...</span>}
                    {settlementStatus === 'discrepancy' && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Discrepancy Detected</span>}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-lg shadow border border-gray-100 lg:col-span-2">
                    <h2 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Treasury Balances</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {treasuryBalances.map((balance) => (
                            <div key={`${balance.walletId}-${balance.asset}`} className="p-4 bg-gray-50 rounded-md border border-gray-100 border-l-4 border-l-blue-500">
                                <div className="text-xs text-gray-500 mb-1 flex justify-between">
                                    <span className="font-mono">{balance.walletId}</span>
                                    <span className="font-bold uppercase">{balance.asset}</span>
                                </div>
                                <div className="flex justify-between items-end mt-2">
                                    <div>
                                        <p className="text-xs text-gray-500">Available</p>
                                        <p className="text-lg font-bold text-gray-900">{balance.available.toLocaleString()}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-500">Held</p>
                                        <p className="text-md font-semibold text-gray-600">{balance.held.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {treasuryBalances.length === 0 && <p className="text-sm text-gray-500">No balances available</p>}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Volume by Rail</h2>
                    <div className="h-48 w-full relative">
                        {railData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={railData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={70}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {railData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={RAIL_COLORS[entry.name] || '#9ca3af'} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value?: number) => value !== undefined ? `$${value.toFixed(2)}` : '$0.00'} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm text-gray-400">No data available</span>
                            </div>
                        )}
                    </div>
                    <div className="mt-2 text-xs flex flex-wrap gap-2 justify-center">
                        {railData.map(entry => (
                            <div key={entry.name} className="flex items-center">
                                <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: RAIL_COLORS[entry.name] || '#9ca3af' }}></span>
                                <span className="capitalize">{entry.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Recent Transactions</h2>
                    <ul className="divide-y divide-gray-200">
                        {transactions.slice(0, 10).map((tx) => (
                            <li key={tx.receiptId} className="py-3 flex justify-between items-center">
                                <div>
                                    <p className="font-medium text-gray-900">
                                        {tx.currency.toUpperCase()} {tx.amount.toFixed(2)}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1 capitalize flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RAIL_COLORS[tx.rail] || '#9ca3af' }}></span>
                                        {tx.rail}
                                    </p>
                                </div>
                                <div className="text-right">
                                    {getTransactionBadge(tx.status)}
                                    <p className="text-xs text-gray-400 mt-1">{new Date(tx.createdAt).toLocaleDateString()}</p>
                                </div>
                            </li>
                        ))}
                        {transactions.length === 0 && <li className="py-3 text-sm text-gray-500">No transactions found</li>}
                    </ul>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                        <h2 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Active Quotes</h2>
                        <ul className="divide-y divide-gray-200">
                            {activeQuotes.map((q) => (
                                <li key={q.quoteId} className="py-3">
                                    <div className="flex justify-between">
                                        <p className="font-medium text-gray-900 text-sm">{q.currency.toUpperCase()} {q.totalAmount.toFixed(2)}</p>
                                        <p className="text-xs text-red-500 font-medium whitespace-nowrap">
                                            Expires: {new Date(q.expiresAt).toLocaleTimeString()}
                                        </p>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1 truncate max-w-sm">From: {q.counterpartyId}</p>
                                </li>
                            ))}
                            {activeQuotes.length === 0 && <li className="py-3 text-sm text-gray-500">No active quotes</li>}
                        </ul>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow border border-gray-100 overflow-hidden">
                        <h2 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Activity Log (Refunds/Credits)</h2>
                        <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
                            {recentEvents.map((evt) => (
                                <li key={evt.eventId} className="py-2">
                                    <div className="flex justify-between">
                                        <p className="text-sm font-medium capitalize flex items-center gap-2">
                                            <span className={`w-1.5 h-1.5 rounded-full ${['refunded', 'credited'].includes(evt.eventType) ? 'bg-purple-500' : 'bg-gray-400'}`}></span>
                                            {evt.eventType.replace('_', ' ')}
                                        </p>
                                        <p className="text-sm text-gray-900 font-semibold">{evt.currency.toUpperCase()} {evt.amount.toFixed(2)}</p>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {new Date(evt.timestamp).toLocaleString()} • {evt.rail}
                                    </p>
                                </li>
                            ))}
                            {recentEvents.length === 0 && <li className="py-3 text-sm text-gray-500">No recent activity</li>}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}
