import {IntegrationSearchResult} from "./common";

export interface EasynewsSearchOptions {
    rawQuery?: string;
    fallbackQuery?: string;
    year?: number;
    season?: number;
    episode?: number;
    strictMode?: boolean;
    specialTextOnly?: boolean;
}

export interface EasynewsResult extends IntegrationSearchResult {
    poster?: string;
    easynewsPayload?: string;
    release?: {
        resolution?: string | null;
        languages?: string[];
    };
    _sourceType?: "easynews";
}

export interface EasynewsNzbDownload {
    buffer: Buffer;
    fileName: string;
    contentType: string;
}

export interface EasynewsClient {
    EASYNEWS_SEARCH_STANDALONE_TIMEOUT_MS: number;
    reloadConfig(input?: { addonBaseUrl?: string; sharedSecret?: string }): void;
    isEasynewsEnabled(): boolean;
    requiresCinemetaMetadata(isSpecialRequest: boolean): boolean;
    searchEasynews(options?: EasynewsSearchOptions): Promise<EasynewsResult[]>;
    downloadEasynewsNzb(payloadToken: string): Promise<EasynewsNzbDownload>;
    testEasynewsCredentials(input?: { username?: string; password?: string }): Promise<string>;
}
