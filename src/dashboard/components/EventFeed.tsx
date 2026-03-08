import React from 'react'
import { SystemEvent } from '@shared/types'
import { AlertCircle, Info, AlertTriangle, ShieldAlert } from 'lucide-react'

export interface EventFeedProps {
    events: SystemEvent[]
}

export function EventFeed({ events }: EventFeedProps) {
    const getSeverityStyles = (severity: string, eventType: string) => {
        // Specific Event Type Overrides
        if (eventType === 'circuit_breaker.tripped') {
            return { bg: 'bg-red-950', border: 'border-red-900', text: 'text-red-50', icon: <ShieldAlert className="w-6 h-6 text-red-500 animate-pulse" /> }
        }
        if (eventType === 'budget.warning') {
            return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-900', icon: <AlertTriangle className="w-5 h-5 text-orange-600 animate-pulse" /> }
        }
        if (eventType === 'eval.escalated') {
            return { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-900', icon: <AlertCircle className="w-5 h-5 text-indigo-600 animate-pulse" /> }
        }

        // Default severity styling
        switch (severity) {
            case 'info':
                return { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-800', icon: <Info className="w-4 h-4 text-blue-500" /> }
            case 'warning':
                return { bg: 'bg-yellow-50', border: 'border-yellow-100', text: 'text-yellow-800', icon: <AlertTriangle className="w-4 h-4 text-yellow-600" /> }
            case 'error':
                return { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-800', icon: <AlertCircle className="w-4 h-4 text-red-600" /> }
            case 'critical':
                return { bg: 'bg-red-900', border: 'border-red-950', text: 'text-red-100', icon: <ShieldAlert className="w-5 h-5 text-red-400" /> }
            default:
                return { bg: 'bg-gray-50', border: 'border-gray-100', text: 'text-gray-800', icon: <Info className="w-4 h-4 text-gray-500" /> }
        }
    }

    return (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[400px]">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h3 className="font-semibold text-gray-800 text-sm">System Events</h3>
                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full font-medium">Live</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {events.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                        No recent events
                    </div>
                ) : (
                    events.map((event) => {
                        const styles = getSeverityStyles(event.severity, event.eventType)
                        const isCritical = event.severity === 'critical' || event.eventType === 'circuit_breaker.tripped'
                        return (
                            <div
                                key={event.eventId}
                                className={`p-3 rounded-lg border flex gap-3 shadow-sm ${styles.bg} ${styles.border} ${isCritical ? 'ring-2 ring-red-500/20' : ''}`}
                            >
                                <div className="flex-shrink-0 mt-0.5 flex items-center justify-center">
                                    {styles.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`font-semibold text-sm truncate ${styles.text}`}>
                                            {event.eventType}
                                        </span>
                                        <span className={`text-[10px] whitespace-nowrap ml-2 ${isCritical ? 'text-red-300' : 'text-gray-500'}`}>
                                            {new Date(event.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>

                                    <div className={`text-xs space-y-0.5 ${isCritical ? 'text-red-200' : 'text-gray-600'}`}>
                                        {event.agentId && (
                                            <div className="flex gap-1.5"><span className={isCritical ? 'text-red-400' : 'text-gray-400'}>Agent:</span> {event.agentId}</div>
                                        )}
                                        {event.taskId && (
                                            <div className="flex gap-1.5"><span className={isCritical ? 'text-red-400' : 'text-gray-400'}>Task:</span> {event.taskId.substring(0, 8)}...</div>
                                        )}
                                        <div className={`mt-1 font-mono text-[10px] break-all p-1.5 rounded ${isCritical ? 'bg-red-950/50 text-red-100 border border-red-800/50' : 'bg-white/50 border border-gray-100'}`}>
                                            {JSON.stringify(event.payload)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
