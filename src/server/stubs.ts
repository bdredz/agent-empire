import type { GoalAnalyzer, GoalAnalysis, TaskExecutor, NodeExecutionResult } from '@orchestrator/IJarvis'
import type { TaskDAG } from '@orchestrator/TaskDAG'
import { DAGNodeStatus } from '@orchestrator/TaskDAG'
import { AgentRole, createTaskId, EvalOutcome, TaskPriority } from '@shared/types'

export function createStubGoalAnalyzer(): GoalAnalyzer {
  return {
    async analyzeGoal(goal: string): Promise<GoalAnalysis> {
      return {
        fields: {
          objective: goal,
          scope: null,
          constraints: null,
          audience: null,
          success_criteria: null,
          dependencies: null,
          risk_tolerance: null,
          approval_required: null,
          timeline: null,
          priority: null,
        },
        suggestedTasks: [`Execute: ${goal}`],
        estimatedComplexity: 'low',
      }
    },
    async decomposeGoal(goal: string, _analysis: GoalAnalysis): Promise<TaskDAG> {
      const taskId = createTaskId(`stub-${Date.now()}`)
      return {
        goalId: `goal-${Date.now()}`,
        goalDescription: goal,
        nodes: [{
          taskId,
          name: 'Stub task',
          description: goal,
          assignedRole: AgentRole.Worker,
          priority: TaskPriority.Normal,
          dependencies: [],
          status: DAGNodeStatus.Pending,
        }],
        createdAt: new Date().toISOString(),
      }
    },
  }
}

export function createStubTaskExecutor(): TaskExecutor {
  return {
    async executeNode(_dag: TaskDAG, _nodeIndex: number): Promise<NodeExecutionResult> {
      return {
        success: true,
        evalResult: {
          outcome: EvalOutcome.Pass,
          scores: { overall: 1.0 },
          reasoning: 'Stub execution — pass',
          evaluatorId: 'stub-executor',
          timestamp: new Date().toISOString(),
        },
      }
    },
  }
}
