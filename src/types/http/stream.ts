import {ErrorResponse, QueryRecord, RequestLike, ResponseLike, RouteTokenParam} from "../shared/http";
import {StreamResponse} from "../stream/payload";

export interface StreamRouteParams extends RouteTokenParam {
    type: string;
    id: string;
}

export interface NzbdavStreamRouteParams extends RouteTokenParam {
    encodedParams?: string;
    filename?: string;
}

export interface StreamQuery extends QueryRecord {
    season?: string | number;
    episode?: string | number;
    maxSizeGb?: string | number;
    max_size_gb?: string | number;
    triageSizeGb?: string | number;
    triage_size_gb?: string | number;
    preferredSizeGb?: string | number;
    triageIndexerIds?: string | string[];
    triageDisabled?: string | boolean;
    triageEnabled?: string | boolean;
    sortMode?: string;
    nzbSortMode?: string;
    preferredLanguages?: string;
    preferredLanguage?: string;
    language?: string;
    lang?: string;
    dedupe?: string | boolean;
    dedupeEnabled?: string | boolean;
    dedupeDisabled?: string | boolean;
    tvdbId?: string;
    tvdb_id?: string;
    tvdb?: string;
    tvdbSlug?: string;
    tvdbid?: string;
    tmdbId?: string;
    tmdb_id?: string;
    tmdb?: string;
    tmdbSlug?: string;
    tmdbid?: string;
    title?: string;
    name?: string;
    originalTitle?: string;
    original_title?: string;
}

export interface NzbdavStreamQuery extends QueryRecord {
    downloadUrl?: string;
    type?: string;
    id?: string;
    title?: string;
    easynewsPayload?: string;
    size?: string | number;
    historyNzoId?: string;
    historyJobName?: string;
    historyCategory?: string;
    season?: string | number;
    episode?: string | number;
}

export interface EasynewsNzbQuery extends QueryRecord {
    payload?: string;
}

export type StreamHandlerRequest = RequestLike<StreamRouteParams, StreamQuery>;
export type StreamHandlerResponse = ResponseLike<StreamResponse | ErrorResponse>;

export type NzbdavStreamHandlerRequest = RequestLike<NzbdavStreamRouteParams, NzbdavStreamQuery>;
export type NzbdavStreamHandlerResponse = ResponseLike<ErrorResponse>;

export type EasynewsNzbHandlerRequest = RequestLike<RouteTokenParam, EasynewsNzbQuery>;
export type EasynewsNzbHandlerResponse = ResponseLike<ErrorResponse>;
