import {ErrorResponse, RequestLike, ResponseLike, RouteTokenParam} from "../shared/http";

export type StremioContentType = "movie" | "series" | "channel" | "tv";

export interface ManifestCatalog {
    type: string;
    id: string;
    name: string;
    pageSize?: number;
    extra?: Array<{name: string}>;
}

export interface ManifestResponse {
    id: string;
    version: string;
    name: string;
    description: string;
    logo: string;
    resources: string[];
    types: StremioContentType[];
    catalogs: ManifestCatalog[];
    idPrefixes: string[];
}

export type ManifestHandlerRequest = RequestLike<RouteTokenParam>;
export type ManifestHandlerResponse = ResponseLike<ManifestResponse | ErrorResponse>;
