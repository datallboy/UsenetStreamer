export interface IntegrationSearchPlan {
    type: string;
    query: string;
    rawQuery?: string | null;
    tokens?: string[];
    strictMatch?: boolean;
    strictPhrase?: string;
}

export interface IntegrationSearchResult {
    title: string;
    downloadUrl: string;
    guid?: string | null;
    size?: number;
    age?: string | number;
    ageDays?: number | null;
    publishDate?: string;
    publishDateIso?: string;
    publishDateMs?: number;
    indexer?: string;
    indexerId?: string;
    [key: string]: unknown;
}

export interface IntegrationEndpointSummary {
    id?: string;
    name?: string;
    count: number;
    error?: string;
}

export interface IntegrationSearchResponse<T extends IntegrationSearchResult = IntegrationSearchResult> {
    results: T[];
    errors: string[];
    endpoints?: IntegrationEndpointSummary[];
}
