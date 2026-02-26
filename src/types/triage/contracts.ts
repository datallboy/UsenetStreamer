export type TriageDecisionStatus =
    | "verified"
    | "unverified"
    | "unverified_7z"
    | "blocked"
    | "fetch-error"
    | "error"
    | "pending"
    | "skipped"
    | "not-run"
    | "unknown";

export interface TriageArchiveFinding {
    status?: string;
    details?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface TriageDecision {
    status: TriageDecisionStatus | string;
    blockers: string[];
    warnings: string[];
    nzbIndex: number | null;
    fileCount: number | null;
    archiveFindings: TriageArchiveFinding[];
    title?: string | null;
    normalizedTitle?: string | null;
    indexerId?: string | null;
    indexerName?: string | null;
    publishDateMs?: number | null;
    publishDateIso?: string | null;
    ageDays?: number | null;
    nzbPayload?: string;
    error?: string;
}

export type TriageDecisionMap = Map<string, TriageDecision>;

export interface TriageRunnerOptions {
    timeBudgetMs?: number;
    preferredSizeBytes?: number | null;
    preferredIndexerIds?: string[];
    serializedIndexerIds?: string[];
    allowedIndexerIds?: string[];
    maxCandidates?: number;
    logger?: unknown;
    triageOptions?: Record<string, unknown>;
    captureNzbPayloads?: boolean;
    downloadConcurrency?: number;
    downloadTimeoutMs?: number;
}

export interface TriageRunnerOutcome {
    decisions: TriageDecisionMap;
    elapsedMs: number;
    timedOut: boolean;
    candidatesConsidered: number;
    evaluatedCount: number;
    fetchFailures: number;
    summary: unknown;
}

export interface TriageRunnerClient {
    triageAndRank(nzbResults: Array<Record<string, unknown>>, options?: TriageRunnerOptions): Promise<TriageRunnerOutcome>;
}
