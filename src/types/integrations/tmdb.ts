export interface TmdbConfig {
    enabled: boolean;
    apiKey: string;
    additionalLanguages: string[];
    searchMode: "english_only" | "english_and_regional" | "regional_only" | string;
}

export interface TmdbFindResult {
    tmdbId: string;
    mediaType: "movie" | "series" | string;
    originalTitle?: string | null;
    originalLanguage?: string | null;
    year?: number | null;
}

export interface TmdbExternalIds {
    imdbId?: string | null;
    tvdbId?: string | null;
    tmdbId?: string | null;
}

export interface TmdbDetailsTranslation {
    iso_639_1?: string;
    iso_3166_1?: string;
    title?: string;
    name?: string;
}

export interface TmdbDetails {
    title?: string | null;
    originalTitle?: string | null;
    originalLanguage?: string | null;
    releaseDate?: string | null;
    firstAirDate?: string | null;
    year?: number | null;
    translations: TmdbDetailsTranslation[];
}

export interface TmdbTitleOption {
    language: string;
    title: string;
    asciiTitle?: string | null;
    year?: number | null;
}

export interface TmdbMetadataAndTitles {
    tmdbId: string;
    mediaType: string;
    originalTitle?: string | null;
    originalLanguage?: string | null;
    year?: number | null;
    titles: TmdbTitleOption[];
}

export interface TmdbLocalizedTitle {
    localizedTitle: string;
    asciiTitle?: string | null;
    originalTitle?: string | null;
    language?: string | null;
    tmdbId?: string | null;
}

export interface TmdbClient {
    reloadConfig(): void;
    isConfigured(): boolean;
    getConfig(): TmdbConfig;
    findByExternalId(externalId: string, externalSource?: string): Promise<TmdbFindResult | null>;
    getDetails(tmdbId: string, mediaType: string, language?: string | null): Promise<TmdbDetails | null>;
    getExternalIds(tmdbId: string, mediaType: string): Promise<TmdbExternalIds | null>;
    getMetadataAndTitles(input: { imdbId?: string; tmdbId?: string; type: string }): Promise<TmdbMetadataAndTitles | null>;
    getLocalizedTitle(input: {
        imdbId: string;
        type: string;
        englishTitle: string;
        preferredLanguages?: string[];
    }): Promise<TmdbLocalizedTitle | null>;
    normalizeToAscii(text: string): string;
    languageNameToLocale(languageName: string): string | null;
    clearCache(): void;
}
