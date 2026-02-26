export interface TvdbConfig {
    enabled: boolean;
    apiKey: string;
}

export interface TvdbClient {
    reloadConfig(): void;
    isConfigured(): boolean;
    getConfig(): TvdbConfig;
    getImdbIdForSeries(tvdbId: string): Promise<{ imdbId: string } | null>;
    getTvdbIdForSeries(imdbId: string): Promise<{ tvdbId: string } | null>;
    testTvdbConnection(input: { apiKey?: string; enabled?: string | boolean }): Promise<string>;
}
