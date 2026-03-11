import React from 'react'
import {
    ResearchReport,
    AtomicClaim,
    EvidenceRecord,
    Citation,
    BibliographyEntry
} from '@shared/types'

export interface EvidenceViewerProps {
    report: ResearchReport
    evidence: EvidenceRecord[] // Full evidence records referenced by the report
    bibliography: BibliographyEntry[]
    citations: Citation[] // Citations linking claims to bibliography
}

const getFreshnessColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-100'
    if (score >= 0.5) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
}

const getTrustBadge = (score: number) => {
    if (score >= 0.8) return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-800">High Trust</span>
    if (score >= 0.5) return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-yellow-100 text-yellow-800">Medium</span>
    return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800">Low Trust</span>
}

export function EvidenceViewer({
    report,
    evidence,
    bibliography,
    citations
}: EvidenceViewerProps) {
    const freshnessClass = getFreshnessColor(report.confidence) // wait, report has freshnessDate, but we usually compute freshness.

    // Calculate an aggregate freshness score from evidence if available
    const aggregateFreshness = evidence.length > 0 
        ? evidence.reduce((sum, e) => sum + e.freshnessScore, 0) / evidence.length 
        : 1.0

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            {/* Report Header */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex justify-between items-start">
                    <h1 className="text-2xl font-bold text-gray-900 border-b-2 border-indigo-500 pb-2 mb-4 inline-block">Research Report</h1>
                    <div className="flex items-center space-x-3 text-sm font-medium">
                        <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                            Confidence: {(report.confidence * 100).toFixed(0)}%
                        </span>
                        <span className={`px-3 py-1 rounded-full border ${getFreshnessColor(aggregateFreshness)}`}>
                            Freshness: {(aggregateFreshness * 100).toFixed(0)}%
                        </span>
                        <span className="text-gray-500 text-xs">
                            Date: {new Date(report.freshnessDate).toLocaleDateString()}
                        </span>
                    </div>
                </div>

                <div className="mt-4 space-y-4">
                    <div className="bg-gray-50 p-4 rounded-md border border-gray-100">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Question</h3>
                        <p className="text-lg text-gray-900 font-medium">{report.question}</p>
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Answer</h3>
                        <p className="text-gray-800 text-base leading-relaxed whitespace-pre-wrap">{report.answer}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content Area (Claims) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-sm mr-2">{report.claims.length}</span>
                            Extracted Claims
                        </h2>
                        <ul className="space-y-4">
                            {report.claims.map((claim, idx) => {
                                const claimCitations = citations.filter(c => c.claimId === claim.claimId)
                                const claimEvidence = evidence.find(e => e.evidenceId === claim.evidenceId)

                                return (
                                    <li key={claim.claimId} className="p-4 bg-gray-50 rounded-md border border-gray-100">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold shrink-0">
                                                {idx + 1}
                                            </span>
                                            <span className="ml-3 text-sm text-gray-800 font-medium flex-grow">
                                                {claim.statement}
                                            </span>
                                            <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded bg-gray-200 text-gray-700 shrink-0">
                                                Conf: {(claim.confidence * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        
                                        <div className="ml-9 mt-2 flex flex-wrap gap-2 text-xs">
                                            {claimEvidence && (
                                                <a href={claimEvidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-indigo-600 hover:text-indigo-800 hover:underline">
                                                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                                                    </svg>
                                                    View Source: {new URL(claimEvidence.sourceUrl).hostname}
                                                </a>
                                            )}
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Gaps & Limitations</h2>
                        {report.gaps.length > 0 ? (
                            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                                {report.gaps.map((gap, i) => <li key={`gap-${i}`}>{gap}</li>)}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 italic">No significant gaps identified in this report.</p>
                        )}

                        {report.recommendedNextAction && (
                            <div className="mt-6 pt-4 border-t border-gray-100">
                                <h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-2">Recommended Next Action</h3>
                                <p className="text-sm text-gray-800">{report.recommendedNextAction}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar (Bibliography & Evidence Sources) */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Bibliography</h2>
                        <ul className="space-y-3">
                            {bibliography.map((bib, idx) => (
                                <li key={bib.bibliographyId} className="text-sm border-l-2 border-indigo-200 pl-3 py-1">
                                    <span className="font-semibold text-gray-900 block">[{idx + 1}] {bib.title || 'Untitled Source'}</span>
                                    <a href={bib.sourceUrl} className="text-indigo-600 hover:underline truncate block" target="_blank" rel="noopener noreferrer">
                                        {bib.sourceUrl}
                                    </a>
                                </li>
                            ))}
                            {bibliography.length === 0 && <li className="text-sm text-gray-500">No bibliography available</li>}
                        </ul>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Evidence Sources</h2>
                        <ul className="space-y-4">
                            {evidence.map(record => (
                                <li key={record.evidenceId} className="pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1 py-0.5 rounded uppercase">{record.sourceType}</span>
                                        {getTrustBadge(record.trustScore)}
                                    </div>
                                    <a href={record.sourceUrl} className="text-sm text-gray-800 font-medium hover:text-indigo-600 truncate block mt-1" title={record.sourceUrl} target="_blank" rel="noopener noreferrer">
                                        {record.sourceUrl.split('?')[0]}
                                    </a>
                                    <div className="flex justify-between mt-2 text-xs text-gray-500">
                                        <span>Freshness: {(record.freshnessScore * 100).toFixed(0)}%</span>
                                        <span>{new Date(record.fetchedAt).toLocaleDateString()}</span>
                                    </div>
                                </li>
                            ))}
                            {evidence.length === 0 && <li className="text-sm text-gray-500">No evidence sources available</li>}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}
