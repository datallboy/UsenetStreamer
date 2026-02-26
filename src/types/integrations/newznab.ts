import {IntegrationSearchPlan, IntegrationSearchResponse, IntegrationSearchResult} from "./common";

export interface NewznabPreset {
    id: string;
    label: string;
    endpoint: string;
    apiPath?: string;
    description?: string;
    apiKeyUrl?: string;
}

export interface NewznabIndexerConfig {
    id: string;
    ordinal: number;
    endpoint: string;
    apiKey: string;
    apiPath: string;
    name?: string;
    displayName: string;
    enabled: boolean;
    isPaid: boolean;
    paidLimit: number | null;
    zyclopsEnabled: boolean;
    slug: string;
    dedupeKey: string;
    baseUrl: string;
    _zyclopsOriginalEndpoint?: string;
    _zyclopsOriginalApiPath?: string;
    _zyclopsOriginalApiKey?: string;
}

export interface NewznabCaps {
    supportedParams: Set<string>;
    fetchedAt: number;
    persisted: boolean;
}

export interface NewznabSearchOptions {
    filterNzbOnly?: boolean;
    debug?: boolean;
    timeoutMs?: number;
    label?: string;
    logEndpoints?: boolean;
}

export type NewznabResult = IntegrationSearchResult;

export interface NewznabClient {
    MAX_NEWZNAB_INDEXERS: number;
    NEWZNAB_NUMBERED_KEYS: string[];
    getEnvNewznabConfigs(options?: { includeEmpty?: boolean }): NewznabIndexerConfig[];
    getNewznabConfigsFromValues(values?: Record<string, unknown>, options?: { includeEmpty?: boolean }): NewznabIndexerConfig[];
    filterUsableConfigs(configs?: NewznabIndexerConfig[], options?: { requireEnabled?: boolean; requireApiKey?: boolean }): NewznabIndexerConfig[];
    searchNewznabIndexers(
        plan: IntegrationSearchPlan,
        configs: NewznabIndexerConfig[],
        options?: NewznabSearchOptions
    ): Promise<IntegrationSearchResponse<NewznabResult>>;
    testNewznabCaps(
        config: NewznabIndexerConfig,
        options?: { debug?: boolean; timeoutMs?: number; label?: string }
    ): Promise<string>;
    validateNewznabSearch(
        config: NewznabIndexerConfig,
        options?: { query?: string; timeoutMs?: number; debug?: boolean; label?: string }
    ): Promise<string>;
    getAvailableNewznabPresets(): NewznabPreset[];
    maskApiKey(key?: string): string;
    refreshCapsCache(
        configs: NewznabIndexerConfig[],
        options?: { timeoutMs?: number; debug?: boolean }
    ): Promise<Record<string, NewznabCaps>>;
}
