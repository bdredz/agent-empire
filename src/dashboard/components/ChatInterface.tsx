import React, { useState, useRef, useEffect } from 'react'
import { Send, Bot, User } from 'lucide-react'

export interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
}

export interface ChatInterfaceProps {
    messages: Message[]
    onSendMessage: (content: string) => Promise<void>
    isTyping?: boolean
}

export function ChatInterface({ messages, onSendMessage, isTyping = false }: ChatInterfaceProps) {
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, isTyping])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || sending) return

        setSending(true)
        setInput('')
        try {
            await onSendMessage(input.trim())
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="flex flex-col h-[500px] bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
                <h3 className="text-white font-semibold flex items-center gap-2">
                    <Bot className="w-5 h-5 text-blue-400" />
                    Jarvis Orchestrator
                </h3>
                <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                    </span>
                    <span className="text-green-400 text-xs font-medium">Online</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                        Say hello to Jarvis to get started...
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                        >
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-gray-800 text-gray-200'
                                }`}>
                                {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                            </div>
                            <div className={`px-4 py-2.5 rounded-2xl shadow-sm ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-tr-sm'
                                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'
                                }`}>
                                <p className="whitespace-pre-wrap text-[15px]">{msg.content}</p>
                                <span className={`text-[10px] block mt-1 ${msg.role === 'user' ? 'text-blue-200 text-right' : 'text-gray-400'}`}>
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))
                )}

                {isTyping && (
                    <div className="flex gap-3 max-w-[85%]">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-800 text-gray-200 flex items-center justify-center">
                            <Bot className="w-5 h-5" />
                        </div>
                        <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-gray-100 shadow-sm flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-3 bg-white border-t border-gray-200">
                <form onSubmit={handleSubmit} className="flex gap-2 relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Command Jarvis..."
                        className="flex-1 pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm"
                        disabled={sending}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || sending}
                        className="absolute right-2 top-1.5 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
    )
}
