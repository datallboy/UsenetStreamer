import {StreamItem} from "./payload";
import {TriageDecision} from "../triage/contracts";

export interface StreamRankingBuckets {
    instantStreams: StreamItem[];
    verifiedStreams: StreamItem[];
    regularStreams: StreamItem[];
}

export interface RankedStreamResult {
    stream: StreamItem;
    triageStatus: TriageDecision["status"];
    instant: boolean;
    rank: number;
}

export interface RankedStreamCollection {
    ranked: RankedStreamResult[];
    buckets: StreamRankingBuckets;
}
