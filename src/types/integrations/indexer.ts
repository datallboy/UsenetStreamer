import {IntegrationSearchPlan, IntegrationSearchResult} from "./common";

export type IndexerManagerType = "none" | "prowlarr" | "nzbhydra";

export interface IndexerResult extends IntegrationSearchResult {
    publishDateMs?: number | null;
    publishDateIso?: string | null;
}

export interface IndexerClient {
    ensureIndexerManagerConfigured(): void;
    executeIndexerPlan(plan: IntegrationSearchPlan): Promise<IndexerResult[]>;
    annotateIndexerResult(result: IndexerResult): IndexerResult;
    canShareDecision(
        decisionPublishDateMs?: number | null,
        candidatePublishDateMs?: number | null
    ): boolean;
    isUsingProwlarr(): boolean;
    isUsingNzbhydra(): boolean;
    executeProwlarrSearch(plan: IntegrationSearchPlan): Promise<IndexerResult[]>;
    executeNzbhydraSearch(plan: IntegrationSearchPlan): Promise<IndexerResult[]>;
    buildProwlarrSearchParams(plan: IntegrationSearchPlan): Record<string, string | string[]>;
    buildHydraSearchParams(plan: IntegrationSearchPlan): Record<string, string>;
    reloadConfig(): void;
}
