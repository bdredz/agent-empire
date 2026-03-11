import React from 'react'
import {
    AgentIdentity,
    Mandate,
    CounterpartyRecord,
    TrustAuditEntry
} from '@shared/types'

export interface TrustDashboardProps {
    identities: AgentIdentity[]
    mandates: Mandate[]
    counterparties: CounterpartyRecord[]
    auditLogs: TrustAuditEntry[]
    revokeAlerts?: TrustAuditEntry[] // entries that represent revocations
}

const getVerificationBadge = (status: AgentIdentity['verificationStatus']) => {
    switch (status) {
        case 'verified':
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Verified</span>
        case 'restricted':
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Restricted</span>
        case 'revoked':
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Revoked</span>
        case 'unverified':
        default:
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">Unverified</span>
    }
}

const getTrustStatusBadge = (status: CounterpartyRecord['trustStatus']) => {
    switch (status) {
        case 'trusted':
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Trusted</span>
        case 'watch':
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Watch</span>
        case 'blocked':
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Blocked</span>
        case 'unknown':
        default:
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">Unknown</span>
    }
}

export function TrustDashboard({
    identities,
    mandates,
    counterparties,
    auditLogs,
    revokeAlerts = []
}: TrustDashboardProps) {

    const activeMandates = mandates.filter(m => m.status === 'active')
    const recentLogs = [...auditLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20)

    return (
        <div className="space-y-6">
            {revokeAlerts.length > 0 && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800">Revocation Alerts</h3>
                            <div className="mt-2 text-sm text-red-700">
                                <ul className="list-disc pl-5 space-y-1">
                                    {revokeAlerts.map(alert => (
                                        <li key={alert.entryId}>
                                            Revocation on {new Date(alert.timestamp).toLocaleString()} for {alert.subjectId}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Agent Identities</h2>
                    <ul className="divide-y divide-gray-200">
                        {identities.map((identity) => (
                            <li key={identity.agentId} className="py-3 flex justify-between items-center">
                                <div>
                                    <p className="font-medium text-gray-900">{identity.agentId}</p>
                                    <p className="text-sm text-gray-500">{identity.role}</p>
                                </div>
                                <div>
                                    {getVerificationBadge(identity.verificationStatus)}
                                </div>
                            </li>
                        ))}
                        {identities.length === 0 && <li className="py-3 text-sm text-gray-500">No identities found</li>}
                    </ul>
                </div>

                <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Counterparties</h2>
                    <ul className="divide-y divide-gray-200">
                        {counterparties.map((cp) => (
                            <li key={cp.counterpartyId} className="py-3 flex justify-between items-center">
                                <div>
                                    <p className="font-medium text-gray-900">{cp.displayName}</p>
                                    <p className="text-sm text-gray-500">{cp.counterpartyType} - Risk: {cp.riskScore.toFixed(1)}</p>
                                </div>
                                <div>
                                    {getTrustStatusBadge(cp.trustStatus)}
                                </div>
                            </li>
                        ))}
                        {counterparties.length === 0 && <li className="py-3 text-sm text-gray-500">No counterparties found</li>}
                    </ul>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Active Mandates</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purpose</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scope</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {activeMandates.map(mandate => (
                                <tr key={mandate.mandateId}>
                                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{mandate.delegatedAgentId}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{mandate.purpose}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{mandate.scope.join(', ')}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(mandate.expiresAt).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500 capitalize">{mandate.status}</td>
                                </tr>
                            ))}
                            {activeMandates.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-3 text-sm text-gray-500 text-center">No active mandates</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Recent Trust Audit Logs</h2>
                <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                    {recentLogs.map((log) => (
                        <li key={log.entryId} className="py-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-medium text-gray-900 text-sm">
                                        <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded mr-2 text-xs font-mono">{log.eventType}</span>
                                        {log.subjectId}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">Actor: {log.actorId}</p>
                                    <code className="text-xs bg-gray-50 text-gray-600 block mt-1 p-1 rounded font-mono truncate max-w-lg">
                                        {JSON.stringify(log.details)}
                                    </code>
                                </div>
                                <span className="text-xs text-gray-400 whitespace-nowrap">
                                    {new Date(log.timestamp).toLocaleString()}
                                </span>
                            </div>
                        </li>
                    ))}
                    {recentLogs.length === 0 && <li className="py-3 text-sm text-gray-500">No recent logs</li>}
                </ul>
            </div>
        </div>
    )
}
