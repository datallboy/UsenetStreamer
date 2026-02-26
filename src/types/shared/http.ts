export type QueryValue = string | string[] | number | boolean | null | undefined;
export type QueryRecord = Record<string, QueryValue>;

export interface StreamErrorDetails {
    type?: string;
    id?: string;
    indexerManager?: string;
    indexerManagerUrl?: string;
    timestamp?: string;
    [key: string]: unknown;
}

export interface ErrorResponse {
    error: string;
    details?: StreamErrorDetails;
}

export interface RequestLike<P = Record<string, string | undefined>, Q extends QueryRecord = QueryRecord, B = unknown> {
    params: P;
    query: Q;
    body?: B;
    method?: string;
    path?: string;
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
    connection?: {
        remoteAddress?: string;
    };
}

export interface ResponseLike<T = unknown> {
    status(code: number): ResponseLike<T>;
    json(payload: T): void;
    setHeader(name: string, value: string): void;
    send(payload: unknown): void;
    end(): void;
    redirect?(path: string): void;
    sendFile?(filePath: string): void;
    headersSent?: boolean;
}

export interface RouteTokenParam {
    token?: string;
}
