// Local types pending P3-C1 merge into src/shared/types.ts

export interface EvidenceRecord {
    evidenceId: string;
    questionId?: string;
    tenantId: string;
    sourceUrl: string;
    contentHash: string;
    fetchTimestamp: string;
    publishedTimestamp?: string;
    trustScore: number;
    freshnessScore: number;
    rawContent?: string;
}

export interface AtomicClaim {
    claimId: string;
    evidenceId: string;
    statement: string;
    confidenceScore: number;
}

export interface Citation {
    claimId: string;
    bibliographyId: string;
    inlineText: string;
}

export interface BibliographyEntry {
    bibliographyId: string;
    sourceUrl: string;
    title?: string;
    publishedTimestamp?: string;
}

export interface ResearchReport {
    question: string;
    answer: string;
    claims: AtomicClaim[];
    evidenceIds: string[];
    freshnessDate: string;
    confidence: number;
    gaps: string[];
    recommendedNextAction?: string;
}
