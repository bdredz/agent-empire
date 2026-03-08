import { AgentId } from '@shared/types'

export interface AuditVerdictIssue {
  readonly code: string
  readonly message: string
  readonly severity: 'info' | 'warning' | 'critical'
}

export interface AuditVerdict {
  readonly outcome: 'pass' | 'warn' | 'reject'
  readonly issues: AuditVerdictIssue[]
}

export interface IAuditMinionContext {
  readonly agentId: AgentId
  readonly taskType: string
}

export interface IAuditMinion {
  audit(output: Record<string, unknown>, context: IAuditMinionContext): AuditVerdict
}

export class AuditMinion implements IAuditMinion {
  public audit(output: Record<string, unknown>, context: IAuditMinionContext): AuditVerdict {
    const issues: AuditVerdictIssue[] = []

    // 1. Check for empty or malformed output
    if (!output || Object.keys(output).length === 0) {
      issues.push({
        code: 'MALFORMED_OUTPUT',
        message: 'Output is empty or missing required structural fields',
        severity: 'critical'
      })
    }

    const outputString = JSON.stringify(output)

    // 2. Check for unsafe content patterns (injection markers)
    const unsafePatterns = [
      /<script>/i,
      /javascript:/i,
      /Ignore all previous instructions/i,
      /System instruction:/i
    ]

    for (const pattern of unsafePatterns) {
      if (pattern.test(outputString)) {
        issues.push({
          code: 'UNSAFE_CONTENT',
          message: `Output contains potentially unsafe pattern: ${pattern.toString()}`,
          severity: 'critical'
        })
      }
    }

    // 3. Check for secrets/credentials
    const secretPatterns = [
      /sk-[a-zA-Z0-9]{20,}/,  // API keys
      /ghp_[a-zA-Z0-9]{36}/, // GitHub tokens
      /password\s*=\s*['"][^'"]+['"]/i
    ]

    for (const pattern of secretPatterns) {
      if (pattern.test(outputString)) {
        issues.push({
          code: 'SECRET_LEAK',
          message: 'Output contains potential secrets or credentials',
          severity: 'critical'
        })
      }
    }

    // Context-aware rules: e.g. warn if code output is requested but not provided
    if (context.taskType === 'code_generation' && !outputString.includes('```')) {
      issues.push({
        code: 'MISSING_CODE_BLOCK',
        message: 'Task type implies code generation but no code block found',
        severity: 'warning'
      })
    }

    // Warn level issues (example: very large output)
    if (outputString && outputString.length > 20000) {
      issues.push({
        code: 'LARGE_OUTPUT_WARN',
        message: 'Output is unusually large (over 20,000 chars)',
        severity: 'warning'
      })
    }

    let outcome: 'pass' | 'warn' | 'reject' = 'pass'
    if (issues.some(i => i.severity === 'critical')) {
      outcome = 'reject'
    } else if (issues.some(i => i.severity === 'warning')) {
      outcome = 'warn'
    }

    return { outcome, issues }
  }
}
