import React from 'react'
import { TaskDAG, DAGNode, DAGNodeStatus } from '@orchestrator/TaskDAG'
import { Network, CheckCircle2, CircleDashed, Loader2, AlertCircle, FastForward } from 'lucide-react'

export interface TaskDAGViewerProps {
    dag: TaskDAG
}

export function TaskDAGViewer({ dag }: TaskDAGViewerProps) {
    // Sort nodes simply for a basic list-based tree view.
    // In a real flow editor we'd use react-flow, but here we render a rudimentary grouped view.

    const getStatusConfig = (status: DAGNodeStatus) => {
        switch (status) {
            case DAGNodeStatus.Succeeded:
                return { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: <CheckCircle2 className="w-4 h-4" /> }
            case DAGNodeStatus.Running:
                return { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: <Loader2 className="w-4 h-4 animate-spin" /> }
            case DAGNodeStatus.Failed:
                return { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: <AlertCircle className="w-4 h-4" /> }
            case DAGNodeStatus.Skipped:
                return { color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200', icon: <FastForward className="w-4 h-4" /> }
            case DAGNodeStatus.Ready:
                return { color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: <CircleDashed className="w-4 h-4 flex-shrink-0" /> }
            default: // Pending
                return { color: 'text-gray-400', bg: 'bg-white', border: 'border-gray-200', icon: <CircleDashed className="w-4 h-4 flex-shrink-0" /> }
        }
    }

    // Calculate generic tree levels based on dependencies
    const calculateLevels = () => {
        const levels: Record<string, number> = {}
        const processNode = (node: DAGNode): number => {
            if (levels[node.taskId] !== undefined) return levels[node.taskId]!
            if (node.dependencies.length === 0) {
                levels[node.taskId] = 0
                return 0
            }
            const depLevels = node.dependencies.map(depId => {
                const depNode = dag.nodes.find(n => n.taskId === depId)
                return depNode ? processNode(depNode) : 0
            })
            const level = Math.max(...depLevels) + 1
            levels[node.taskId] = level
            return level
        }

        dag.nodes.forEach(processNode)

        // Group by levels
        const grouped: Record<number, DAGNode[]> = {}
        Object.entries(levels).forEach(([taskId, level]) => {
            if (!grouped[level]) grouped[level] = []
            const node = dag.nodes.find(n => n.taskId === taskId)
            if (node) grouped[level].push(node)
        })

        return grouped
    }

    const levels = calculateLevels()
    const sortedLevels = Object.keys(levels).map(Number).sort((a, b) => a - b)

    return (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Network className="w-5 h-5 text-indigo-500" />
                        Task DAG Graph
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 max-w-md truncate">{dag.goalDescription || 'Executing workflow plan'}</p>
                </div>
                <div className="text-xs font-mono text-gray-500 bg-gray-200 px-2 py-1 rounded">
                    {dag.nodes.length} nodes
                </div>
            </div>

            <div className="p-6 overflow-x-auto">
                <div className="min-w-max flex items-stretch gap-8 relative">
                    {sortedLevels.length === 0 ? (
                        <div className="text-gray-400 text-sm italic py-4">No tasks in graph</div>
                    ) : (
                        sortedLevels.map((levelIndex, i) => (
                            <div key={levelIndex} className="flex flex-col gap-4 relative z-10 w-64">
                                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">
                                    Stage {i + 1}
                                </div>

                                {levels[levelIndex]?.map((node) => {
                                    const config = getStatusConfig(node.status)

                                    return (
                                        <div
                                            key={node.taskId}
                                            className={`p-3 rounded-lg border ${config.bg} ${config.border} shadow-sm relative group`}
                                        >
                                            <div className="flex justify-between items-start mb-1 gap-2">
                                                <h4 className="font-semibold text-gray-900 text-sm leading-tight truncate" title={node.name}>
                                                    {node.name}
                                                </h4>
                                                <div className={config.color} title={node.status}>
                                                    {config.icon}
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-600 line-clamp-2 mt-1 mb-2" title={node.description}>
                                                {node.description}
                                            </p>

                                            <div className="flex items-center justify-between text-[10px] font-mono mt-auto pt-2 border-t border-black/[0.05]">
                                                <span className="bg-white px-1.5 py-0.5 rounded shadow-sm text-gray-600 capitalize flex items-center gap-1">
                                                    Role: {node.assignedRole}
                                                </span>
                                                <span className="text-gray-400" title="Task ID">{node.taskId.substring(0, 8)}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
