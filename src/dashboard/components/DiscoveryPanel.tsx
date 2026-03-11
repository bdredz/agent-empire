import React, { useState } from 'react'
import {
    CapabilityManifest,
    ExternalCapabilityManifest
} from '@shared/types'

export interface DiscoveryPanelProps {
    internalServices: CapabilityManifest[]
    externalServices: ExternalCapabilityManifest[]
    onRefreshRequest: () => Promise<void>
}

type ManifestType = CapabilityManifest | ExternalCapabilityManifest

const getReliabilityColor = (score?: number) => {
    if (score === undefined) return 'text-gray-500'
    if (score >= 0.9) return 'text-green-600'
    if (score >= 0.7) return 'text-yellow-600'
    return 'text-red-600'
}

const getAuthSchemeBadge = (scheme: string) => {
    switch (scheme) {
        case 'internal_only':
            return <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-800">Internal</span>
        case 'api_key':
            return <span className="px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800">API Key</span>
        case 'a402':
            return <span className="px-2 py-1 text-xs font-semibold rounded bg-indigo-100 text-indigo-800">A402</span>
        case 'oauth':
            return <span className="px-2 py-1 text-xs font-semibold rounded bg-purple-100 text-purple-800">OAuth</span>
        default:
            return <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-800">{scheme}</span>
    }
}

export function DiscoveryPanel({
    internalServices,
    externalServices,
    onRefreshRequest
}: DiscoveryPanelProps) {
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [selectedManifest, setSelectedManifest] = useState<ManifestType | null>(null)

    const handleRefresh = async () => {
        setIsRefreshing(true)
        try {
            await onRefreshRequest()
        } finally {
            setIsRefreshing(false)
        }
    }

    const allServices = [
        ...internalServices.map(s => ({ ...s, isExternal: false })),
        ...externalServices.map(s => ({ ...s, isExternal: true }))
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Discovery Panel</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage internal services and external capabilities</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {isRefreshing ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Syncing...
                        </>
                    ) : (
                        <>
                            <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Sync Discovery
                        </>
                    )}
                </button>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auth Scheme</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reliability</th>
                                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {allServices.map((service) => (
                                <tr key={service.manifestId} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedManifest(service)}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">{service.serviceName}</div>
                                                <div className="text-sm text-gray-500">v{service.version}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {service.isExternal ? (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">External</span>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">Internal</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {getAuthSchemeBadge(service.authScheme)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="flex items-center text-sm text-gray-700">
                                            <span className="h-2.5 w-2.5 rounded-full bg-green-500 mr-2 border border-green-200"></span>
                                            Active
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`font-semibold ${getReliabilityColor(service.reliabilityScore)}`}>
                                            {service.reliabilityScore !== undefined ? `${(service.reliabilityScore * 100).toFixed(1)}%` : 'Unknown'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setSelectedManifest(service) }}
                                            className="text-indigo-600 hover:text-indigo-900"
                                        >
                                            View Manifest
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {allServices.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">No services discovered</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal for Manifest Details */}
            {selectedManifest && (
                <div className="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        {/* Background overlay */}
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setSelectedManifest(null)}></div>
                        
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        
                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900 border-b pb-2" id="modal-title">
                                            Manifest Explorer: {selectedManifest.serviceName}
                                        </h3>
                                        <div className="mt-4 bg-gray-900 rounded-md p-4 overflow-x-auto">
                                            <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap break-all">
                                                {JSON.stringify(selectedManifest, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-200">
                                <button 
                                    type="button" 
                                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                                    onClick={() => setSelectedManifest(null)}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
