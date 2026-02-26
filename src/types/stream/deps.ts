import {StreamHandlerRequest, StreamHandlerResponse} from "../http/stream";

export type StreamRouteHandler = (
    req: StreamHandlerRequest,
    res: StreamHandlerResponse
) => Promise<void>;

export interface StreamDeps {
    handlers: {
        legacyStreamHandler: StreamRouteHandler;
    };
    services?: Record<string, unknown>;
    integrations?: Record<string, unknown>;
    domain?: Record<string, unknown>;
    utils?: Record<string, unknown>;
    runtime?: Record<string, unknown>;
}
