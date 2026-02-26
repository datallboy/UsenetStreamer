import {ErrorResponse, QueryRecord, RequestLike, ResponseLike, RouteTokenParam} from "../shared/http";

export type AdminConfigValue = string | number | boolean | null | undefined;
export type AdminConfigValues = Record<string, AdminConfigValue>;

export interface AdminConfigGetResponse {
    values: Record<string, string>;
    manifestUrl: string;
    runtimeEnvPath: string;
    debugNewznabSearch: boolean;
    newznabPresets: unknown[];
    addonVersion: string;
}

export interface AdminConfigSaveBody {
    values: AdminConfigValues;
}

export interface AdminConfigSaveResponse {
    success: true;
    manifestUrl: string;
    hotReloaded: boolean;
    portChanged: boolean;
}

export type AdminConnectionTestType =
    | "indexer"
    | "nzbdav"
    | "usenet"
    | "newznab"
    | "newznab-search"
    | "easynews"
    | "tmdb"
    | "tvdb";

export interface AdminConnectionTestBody {
    type: AdminConnectionTestType | string;
    values: AdminConfigValues;
}

export interface AdminConnectionTestResponse {
    status: "ok" | "error";
    message: string;
}

export type AdminConfigGetRequest = RequestLike<RouteTokenParam, QueryRecord>;
export type AdminConfigGetHandlerResponse = ResponseLike<AdminConfigGetResponse>;

export type AdminConfigSaveRequest = RequestLike<RouteTokenParam, QueryRecord, AdminConfigSaveBody>;
export type AdminConfigSaveHandlerResponse = ResponseLike<AdminConfigSaveResponse | ErrorResponse>;

export type AdminConnectionTestRequest = RequestLike<RouteTokenParam, QueryRecord, AdminConnectionTestBody>;
export type AdminConnectionTestHandlerResponse = ResponseLike<AdminConnectionTestResponse | ErrorResponse>;
