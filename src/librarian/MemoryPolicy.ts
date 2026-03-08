import type { MemoryProposal } from '@shared/types'

export interface MemoryPolicyOptions {
  allowedWriterIds: string[]
  maxRawContentLength: number
}

export interface MemoryPolicyDecision {
  accepted: boolean
  reason?: string
  violations: string[]
}

const SENSITIVE_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'aws_access_key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'private_key', pattern: /-----BEGIN (RSA|EC|DSA|OPENSSH)? ?PRIVATE KEY-----/ },
  { label: 'api_key_token', pattern: /\b(api[_-]?key|token|secret)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{12,}/i },
  { label: 'email_address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { label: 'us_ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
]

const DEFAULT_OPTIONS: MemoryPolicyOptions = {
  allowedWriterIds: ['*'],
  maxRawContentLength: 12_000,
}

export class MemoryPolicy {
  private readonly options: MemoryPolicyOptions

  constructor(options: Partial<MemoryPolicyOptions> = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      allowedWriterIds: options.allowedWriterIds ?? DEFAULT_OPTIONS.allowedWriterIds,
      maxRawContentLength: options.maxRawContentLength ?? DEFAULT_OPTIONS.maxRawContentLength,
    }
  }

  public evaluate(proposal: MemoryProposal): MemoryPolicyDecision {
    const violations: string[] = []

    if (!proposal.tenantId.trim()) {
      violations.push('missing_tenant')
    }

    if (!proposal.sourceAgentId.trim()) {
      violations.push('missing_source_agent')
    }

    if (!proposal.title.trim()) {
      violations.push('missing_title')
    }

    if (!proposal.rawContent.trim()) {
      violations.push('missing_raw_content')
    }

    if (proposal.rawContent.length > this.options.maxRawContentLength) {
      violations.push('content_too_large')
    }

    if (!this.isAllowedWriter(proposal.sourceAgentId)) {
      violations.push('writer_not_allowed')
    }

    for (const { label, pattern } of SENSITIVE_PATTERNS) {
      if (pattern.test(proposal.rawContent)) {
        violations.push(`sensitive_content:${label}`)
      }
    }

    if (violations.length > 0) {
      return {
        accepted: false,
        reason: violations[0],
        violations,
      }
    }

    return {
      accepted: true,
      violations: [],
    }
  }

  private isAllowedWriter(agentId: string): boolean {
    if (this.options.allowedWriterIds.includes('*')) {
      return true
    }
    return this.options.allowedWriterIds.includes(agentId)
  }
}
