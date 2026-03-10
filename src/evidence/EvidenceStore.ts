import { createHash, randomUUID } from 'crypto'
import type { EvidenceRecord } from '@shared/types.js'
import { createEvidenceId } from '@shared/types.js'

export class EvidenceStore {
    private memoryMap = new Map<string, EvidenceRecord>()

    async storeEvidence(
        params: Omit<EvidenceRecord, 'evidenceId' | 'contentHash'> & { contentHash?: string }
    ): Promise<EvidenceRecord> {
        let contentHash = params.contentHash
        if (!contentHash) {
            if (params.rawContent !== undefined) {
                contentHash = createHash('sha256').update(params.rawContent).digest('hex')
            } else {
                throw new Error('Must provide either contentHash or rawContent')
            }
        }

        // Deduplication by contentHash and sourceUrl
        for (const record of this.memoryMap.values()) {
            if (
                record.tenantId === params.tenantId &&
                record.sourceUrl === params.sourceUrl &&
                record.contentHash === contentHash
            ) {
                return record
            }
        }

        const evidenceId = createEvidenceId(randomUUID())
        const newRecord: EvidenceRecord = {
            ...params,
            evidenceId,
            contentHash
        }

        this.memoryMap.set(evidenceId, newRecord)
        return newRecord
    }

    async getEvidence(evidenceId: string, tenantId: string): Promise<EvidenceRecord | null> {
        const record = this.memoryMap.get(evidenceId)
        if (record && record.tenantId === tenantId) {
            return record
        }
        return null
    }

    async listEvidenceByQuestion(questionId: string, tenantId: string): Promise<EvidenceRecord[]> {
        const results: EvidenceRecord[] = []
        for (const record of this.memoryMap.values()) {
            if (record.tenantId === tenantId && record.questionId === questionId) {
                results.push(record)
            }
        }
        return results
    }

    async listEvidenceBySource(sourceUrl: string, tenantId: string): Promise<EvidenceRecord[]> {
        const results: EvidenceRecord[] = []
        for (const record of this.memoryMap.values()) {
            if (record.tenantId === tenantId && record.sourceUrl === sourceUrl) {
                results.push(record)
            }
        }
        return results
    }
}
