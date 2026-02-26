import {MetaItem} from "./common";
import {ErrorResponse, QueryRecord, RequestLike, ResponseLike, RouteTokenParam} from "../shared/http";

export interface CatalogRouteParams extends RouteTokenParam {
    type: string;
    id: string;
}

export interface CatalogQuery extends QueryRecord {
    skip?: string | number;
}

export interface CatalogResponse {
    metas: MetaItem[];
    error?: string;
}

export type CatalogHandlerRequest = RequestLike<CatalogRouteParams, CatalogQuery>;
export type CatalogHandlerResponse = ResponseLike<CatalogResponse | ErrorResponse>;
