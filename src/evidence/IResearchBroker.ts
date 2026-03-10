import type { ResearchReport, EvidenceRecord } from '@shared/types.js'

export interface IResearchBroker {
    research(params: {
        question: string;
        tenantId: string;
        freshnessRequirement?: 'realtime' | 'recent' | 'any';
        maxSources?: number;
        budgetTokens?: number;
    }): Promise<ResearchReport>;
    getEvidence(evidenceId: string, tenantId: string): Promise<EvidenceRecord | null>;
    listEvidence(questionId: string, tenantId: string): Promise<EvidenceRecord[]>;
}
