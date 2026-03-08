'use client'

import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
    readonly children: ReactNode
    readonly fallback?: ReactNode
}

interface ErrorBoundaryState {
    readonly hasError: boolean
    readonly error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback
            return (
                <div className="flex flex-col items-center justify-center min-h-[200px] p-8">
                    <h2 className="text-lg font-semibold text-red-600 mb-2">Something went wrong</h2>
                    <p className="text-sm text-gray-500 mb-4">{this.state.error?.message}</p>
                    <button
                        className="px-4 py-2 bg-gray-800 text-white rounded text-sm hover:bg-gray-700"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        Retry
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}
