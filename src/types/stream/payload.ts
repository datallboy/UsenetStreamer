export interface StreamBehaviorHints {
    notWebReady?: boolean;
    cached?: boolean;
    cachedFromHistory?: boolean;
    filename?: string;
    bingeGroup?: string;
    videoSize?: number;
}

export type StreamHealthCheckResult = "passed" | "failed" | "inconclusive" | "not-run";

export interface StreamHealthCheckArchiveFindingDetails {
    sampleEntries?: string[];
    filenames?: string[];
    name?: string;
}

export interface StreamHealthCheckArchiveFinding {
    status?: string;
    details?: StreamHealthCheckArchiveFindingDetails;
}

export interface StreamHealthCheckMeta {
    status: string;
    blockers?: string[];
    warnings?: string[];
    fileCount?: number | null;
    archiveCheck?: StreamHealthCheckResult;
    missingArticlesCheck?: StreamHealthCheckResult;
    applied: boolean;
    inheritedFromTitle?: boolean;
    archiveFindings?: StreamHealthCheckArchiveFinding[];
    sourceDownloadUrl?: string;
}

export interface StreamMeta {
    originalTitle?: string;
    indexer?: string;
    size?: number;
    quality?: string;
    age?: string | number | null;
    type?: string;
    cached?: boolean;
    cachedFromHistory?: boolean;
    languages?: string[];
    indexerLanguage?: string | null;
    resolution?: string | null;
    preferredLanguageMatch?: boolean;
    preferredLanguageName?: string | null;
    preferredLanguageNames?: string[];
    healthCheck?: StreamHealthCheckMeta;
}

export interface StreamItem {
    name?: string;
    title?: string;
    description?: string;
    url?: string;
    nzbUrl?: string;
    infoHash?: string;
    servers?: string[];
    behaviorHints?: StreamBehaviorHints;
    meta?: StreamMeta;
}

export interface StreamResponse {
    streams: StreamItem[];
    error?: string;
}
