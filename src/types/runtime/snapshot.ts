export type StreamingMode = "nzbdav" | "native";
export type RuntimeIndexerManagerMode = "none" | "prowlarr" | "nzbhydra";

export interface RuntimeTriageNntpConfig {
    readonly host: string;
    readonly port: number;
    readonly user?: string;
    readonly pass?: string;
    readonly useTLS: boolean;
}

export interface RuntimeServerSnapshot {
    readonly host: string;
    readonly port: number;
}

export interface RuntimeAddonSnapshot {
    readonly baseUrl: string;
    readonly sharedSecret: string;
    readonly name: string;
}

export interface RuntimeIndexerManagerSnapshot {
    readonly manager: RuntimeIndexerManagerMode;
    readonly url: string;
    readonly apiKey: string;
    readonly label: string;
    readonly strictIdMatch: boolean;
    readonly indexers: string[] | -1 | null;
    readonly cacheMinutes: number | null;
    readonly baseUrl: string;
    readonly backoffEnabled: boolean;
    readonly backoffSeconds: number;
}

export interface RuntimeNewznabSnapshot {
    readonly enabled: boolean;
    readonly filterNzbOnly: boolean;
    readonly debugSearch: boolean;
    readonly debugTest: boolean;
    readonly debugEndpoints: boolean;
}

export interface RuntimeSortingSnapshot {
    readonly sortMode: string;
    readonly sortOrder: string[];
    readonly preferredLanguages: string[];
    readonly preferredQualities: string[];
    readonly preferredEncodes: string[];
    readonly preferredReleaseGroups: string[];
    readonly preferredVisualTags: string[];
    readonly preferredAudioTags: string[];
    readonly preferredKeywords: string[];
    readonly dedupeEnabled: boolean;
    readonly hideBlockedResults: boolean;
    readonly maxResultSizeBytes: number;
    readonly allowedResolutions: string[];
    readonly releaseExclusions: string[];
    readonly namingPattern: string;
    readonly displayNamePattern: string;
    readonly resolutionLimitPerQuality: number | null;
}

export interface RuntimeTriageSnapshot {
    readonly enabled: boolean;
    readonly timeBudgetMs: number;
    readonly maxCandidates: number;
    readonly downloadConcurrency: number;
    readonly priorityIndexers: string[];
    readonly priorityIndexerLimits: string[];
    readonly healthIndexers: string[];
    readonly serializedIndexers: string[];
    readonly nntpConfig: RuntimeTriageNntpConfig | null;
    readonly maxDecodedBytes: number;
    readonly nntpMaxConnections: number;
    readonly maxParallelNzbs: number;
    readonly reusePool: boolean;
    readonly nntpKeepAliveMs: number;
    readonly prefetchFirstVerified: boolean;
}

export interface RuntimeNzbdavSnapshot {
    readonly historyCatalogLimit: number;
}

export interface RuntimeSnapshot {
    readonly generatedAt: string;
    readonly server: RuntimeServerSnapshot;
    readonly streaming: {
        readonly mode: StreamingMode;
    };
    readonly addon: RuntimeAddonSnapshot;
    readonly indexerManager: RuntimeIndexerManagerSnapshot;
    readonly newznab: RuntimeNewznabSnapshot;
    readonly sorting: RuntimeSortingSnapshot;
    readonly triage: RuntimeTriageSnapshot;
    readonly nzbdav: RuntimeNzbdavSnapshot;
    readonly featureFlags: {
        readonly streamV2Enabled: boolean;
    };
}
