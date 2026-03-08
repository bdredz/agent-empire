import React from 'react'
import { HitlApproval, ApprovalStatus } from '@shared/types'
import { AlertCircle, Check, X, Clock } from 'lucide-react'

export interface HitlApprovalQueueProps {
    approvals: HitlApproval[]
    onApprove: (approvalId: string) => Promise<void>
    onDeny: (approvalId: string) => Promise<void>
}

export function HitlApprovalQueue({ approvals, onApprove, onDeny }: HitlApprovalQueueProps) {
    const pendingApprovals = approvals.filter(a => a.status === ApprovalStatus.Pending)

    return (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-orange-500" />
                    Requires Human Approval
                </h3>
                {pendingApprovals.length > 0 && (
                    <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                        {pendingApprovals.length} Pending
                    </span>
                )}
            </div>

            <div className="divide-y divide-gray-100">
                {pendingApprovals.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Check className="w-8 h-8 mx-auto text-green-400 mb-2" />
                        <p className="text-sm font-medium">All clear! No pending approvals.</p>
                    </div>
                ) : (
                    pendingApprovals.map((approval) => (
                        <div key={approval.approvalId} className="p-5 hover:bg-gray-50 transition-colors">
                            <div className="flex justify-between items-start gap-4 mb-3">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-bold text-gray-900">{approval.action}</h4>
                                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${approval.riskLevel === 'high' || approval.riskLevel === 'critical' ? 'bg-red-100 text-red-700' :
                                                approval.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-green-100 text-green-700'
                                            }`}>
                                            {approval.riskLevel} Risk
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-2">{approval.context}</p>

                                    <div className="flex items-center gap-4 text-xs text-gray-500 font-mono">
                                        <span className="flex items-center gap-1">
                                            <UserIcon className="w-3 h-3" /> {approval.requestingAgentId}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> Expires: {new Date(approval.expiresAt).toLocaleTimeString()}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-2">
                                    <button
                                        onClick={() => onDeny(approval.approvalId)}
                                        className="px-3 py-2 flex items-center justify-center gap-1.5 text-red-700 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-semibold transition-colors border border-red-200"
                                    >
                                        <X className="w-4 h-4" /> Deny
                                    </button>
                                    <button
                                        onClick={() => onApprove(approval.approvalId)}
                                        className="px-3 py-2 flex items-center justify-center gap-1.5 text-white bg-green-600 hover:bg-green-700 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                                    >
                                        <Check className="w-4 h-4" /> Approve
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

function UserIcon(props: React.ComponentProps<'svg'>) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
    )
}
