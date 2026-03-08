import { z } from 'zod'
import { Octokit } from 'octokit'
import {
  RepoProvisionRequest,
  RepoProvisionResult,
} from '@shared/types'
import { IRepoProvisioner } from '@mechanic/IMechanic'

interface RepoClient {
  request(
    route: string,
    params: Record<string, unknown>,
  ): Promise<{ data: { html_url?: string; default_branch?: string } }>
}

const repoRequestSchema = z.object({
  businessId: z.string().min(1),
  repoName: z.string().min(1),
  isPrivate: z.literal(true),
  templateRepo: z.string().optional(),
})

export class RepoProvisioner implements IRepoProvisioner {
  constructor(
    private readonly org: string,
    private readonly client: RepoClient = new Octokit({ auth: process.env.GITHUB_TOKEN }),
  ) {}

  public async provisionRepo(request: RepoProvisionRequest): Promise<RepoProvisionResult> {
    this.validateRequest(request)

    try {
      const response = await this.client.request('POST /orgs/{org}/repos', {
        org: this.org,
        name: request.repoName,
        private: request.isPrivate,
        auto_init: true,
      })

      return {
        repoUrl: response.data.html_url ?? '',
        defaultBranch: response.data.default_branch ?? 'main',
        status: 'created',
      }
    } catch {
      return {
        repoUrl: '',
        defaultBranch: 'main',
        status: 'failed',
      }
    }
  }

  private validateRequest(request: RepoProvisionRequest): void {
    const parsed = repoRequestSchema.safeParse(request)
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      throw new Error(`Invalid repo provision request: ${details}`)
    }
  }
}
