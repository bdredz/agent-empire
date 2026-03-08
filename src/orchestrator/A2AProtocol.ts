import { AgentId, TaskId, ArtifactId, EvalResult } from '@shared/types'

// ---------------------------------------------------------------------------
// A2A Message Types — structured inter-agent communication
// All inter-agent communication uses structured JSON over typed protocol.
// ---------------------------------------------------------------------------

export const A2AMessageType = {
  TaskAssignment: 'task.assignment',
  TaskProgress: 'task.progress',
  TaskResult: 'task.result',
  TaskFailure: 'task.failure',
  ClarificationRequest: 'clarification.request',
  ClarificationResponse: 'clarification.response',
  EscalationNotice: 'escalation.notice',
  StatusQuery: 'status.query',
  StatusResponse: 'status.response',
} as const
export type A2AMessageType = typeof A2AMessageType[keyof typeof A2AMessageType]

// ---------------------------------------------------------------------------
// A2A Envelope — wraps all messages
// ---------------------------------------------------------------------------

export interface A2AEnvelope {
  readonly messageId: string
  readonly messageType: A2AMessageType
  readonly fromAgentId: AgentId
  readonly toAgentId: AgentId
  readonly taskId?: TaskId
  readonly timestamp: string  // ISO 8601
  readonly payload: A2APayload
  readonly correlationId?: string  // links request/response pairs
}

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export type A2APayload =
  | TaskAssignmentPayload
  | TaskProgressPayload
  | TaskResultPayload
  | TaskFailurePayload
  | ClarificationRequestPayload
  | ClarificationResponsePayload
  | EscalationNoticePayload
  | StatusQueryPayload
  | StatusResponsePayload

export interface TaskAssignmentPayload {
  readonly type: 'task.assignment'
  readonly taskDescription: string
  readonly inputs: ArtifactId[]
  readonly deadline?: string
  readonly priority: string
}

export interface TaskProgressPayload {
  readonly type: 'task.progress'
  readonly percentComplete: number
  readonly currentStep: string
  readonly artifactsProduced: ArtifactId[]
}

export interface TaskResultPayload {
  readonly type: 'task.result'
  readonly success: boolean
  readonly artifacts: ArtifactId[]
  readonly evalResult?: EvalResult
  readonly summary: string
}

export interface TaskFailurePayload {
  readonly type: 'task.failure'
  readonly errorMessage: string
  readonly retryable: boolean
  readonly attemptNumber: number
}

export interface ClarificationRequestPayload {
  readonly type: 'clarification.request'
  readonly question: string
  readonly options?: string[]
  readonly context: string
  readonly requiredFields: string[]
}

export interface ClarificationResponsePayload {
  readonly type: 'clarification.response'
  readonly answers: Record<string, string>
}

export interface EscalationNoticePayload {
  readonly type: 'escalation.notice'
  readonly reason: string
  readonly evalResult: EvalResult
  readonly previousAttempts: number
}

export interface StatusQueryPayload {
  readonly type: 'status.query'
  readonly queryFields: string[]
}

export interface StatusResponsePayload {
  readonly type: 'status.response'
  readonly fields: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Message factory
// ---------------------------------------------------------------------------

export function createA2AEnvelope(
  messageType: A2AMessageType,
  from: AgentId,
  to: AgentId,
  payload: A2APayload,
  options: { taskId?: TaskId; correlationId?: string } = {}
): A2AEnvelope {
  return {
    messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    messageType,
    fromAgentId: from,
    toAgentId: to,
    taskId: options.taskId,
    timestamp: new Date().toISOString(),
    payload,
    correlationId: options.correlationId,
  }
}
