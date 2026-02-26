import {RequestLike, ResponseLike} from "../shared/http";

export interface NzbdavHistoryEntry {
    nzoId?: string;
    nzo_id?: string;
    jobName?: string;
    job_name?: string;
    category?: string;
    [key: string]: unknown;
}

export interface NzbdavBestVideoMatch {
    name: string;
    size: number;
    matchesEpisode: boolean;
    absolutePath: string;
    viewPath: string;
}

export interface NzbdavStreamData {
    nzoId: string;
    category: string;
    jobName: string;
    viewPath: string;
    fileName: string;
    size?: number;
    absolutePath?: string;
}

export interface NzbdavFailureError extends Error {
    isNzbdavFailure?: boolean;
    failureMessage?: string;
    nzoId?: string;
    category?: string;
    downloadUrl?: string;
    title?: string;
}

export interface NzbdavClient {
    ensureNzbdavConfigured(): void;
    getNzbdavCategory(type?: string): string;
    buildNzbdavApiParams(mode: string, extra?: Record<string, unknown>): Record<string, unknown>;
    extractNzbdavQueueId(payload: unknown): string | null;
    addNzbToNzbdav(input: {
        downloadUrl?: string;
        cachedEntry?: unknown;
        category: string;
        jobLabel?: string;
    }): Promise<{ nzoId: string }>;
    waitForNzbdavHistorySlot(nzoId: string, category?: string): Promise<NzbdavHistoryEntry>;
    fetchCompletedNzbdavHistory(categories?: string[], limitOverride?: number | null): Promise<Map<string, NzbdavHistoryEntry>>;
    buildNzbdavCacheKey(
        downloadUrl: string,
        category: string,
        requestedEpisode?: { season: number; episode: number } | null
    ): string;
    listWebdavDirectory(directory: string): Promise<Array<Record<string, unknown>>>;
    findBestVideoFile(input: {
        category: string;
        jobName: string;
        requestedEpisode?: { season: number; episode: number } | null;
    }): Promise<NzbdavBestVideoMatch | null>;
    buildNzbdavStream(input: {
        downloadUrl: string;
        category: string;
        title: string;
        requestedEpisode?: { season: number; episode: number } | null;
        existingSlot?: { nzoId?: string; jobName?: string; category?: string } | null;
        inlineCachedEntry?: unknown;
    }): Promise<NzbdavStreamData>;
    streamFileResponse(
        req: RequestLike,
        res: ResponseLike,
        absolutePath: string,
        emulateHead: boolean,
        logPrefix: string,
        existingStats?: unknown
    ): Promise<void>;
    streamFailureVideo(req: RequestLike, res: ResponseLike, failureError: NzbdavFailureError): Promise<boolean>;
    streamVideoTypeFailure(req: RequestLike, res: ResponseLike, failureError: NzbdavFailureError): Promise<boolean>;
    proxyNzbdavStream(req: RequestLike, res: ResponseLike, viewPath: string, fileNameHint?: string): Promise<void>;
    getWebdavClient(): Promise<unknown>;
    reloadConfig(): void;
}
