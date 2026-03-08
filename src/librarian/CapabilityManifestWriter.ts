import type { CapabilityManifest } from '@shared/types'
import type { SubmitProposalResult } from '@librarian/ILibrarian'
import { createCapabilityManifestProposal } from './Librarian'

export interface CapabilityManifestSubmissionTarget {
  submitProposal(proposal: ReturnType<typeof createCapabilityManifestProposal>): Promise<SubmitProposalResult>
}

export class CapabilityManifestWriter {
  constructor(private readonly target: CapabilityManifestSubmissionTarget) {}

  public async write(manifest: CapabilityManifest): Promise<SubmitProposalResult> {
    const proposal = createCapabilityManifestProposal(manifest)
    return this.target.submitProposal(proposal)
  }
}
