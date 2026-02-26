import {MetaItem} from "./common";
import {ErrorResponse, RequestLike, ResponseLike, RouteTokenParam} from "../shared/http";

export interface MetaRouteParams extends RouteTokenParam {
    type: string;
    id: string;
}

export interface MetaResponse {
    meta: MetaItem | null;
    error?: string;
}

export type MetaHandlerRequest = RequestLike<MetaRouteParams>;
export type MetaHandlerResponse = ResponseLike<MetaResponse | ErrorResponse>;
