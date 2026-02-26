export interface StreamTemplateStreamContext {
    proxied: boolean;
    private: boolean;
    resolution: string;
    upscaled: boolean;
    quality: string;
    qualitySummary: string;
    streamQuality: string;
    resolutionQuality: string;
    encode: string;
    type: string;
    visualTags: string[];
    audioTags: string[];
    audioChannels: string[];
    seeders: number;
    size: number;
    folderSize: number;
    indexer: string;
    languages: string[];
    network: string;
    title: string;
    filename: string;
    message: string;
    health: string;
    releaseGroup: string;
    shortName: string;
    cached: boolean;
    instant: boolean;
}

export interface StreamTemplateServiceContext {
    shortName: string;
    cached: boolean;
    instant: boolean;
}

export interface StreamTemplateAddonContext {
    name: string;
}

export interface StreamTemplateContext {
    addon: StreamTemplateAddonContext;
    title: string;
    filename: string;
    indexer: string;
    size: string;
    quality: string;
    source: string;
    codec: string;
    group: string;
    health: string;
    languages: string;
    tags: string;
    resolution: string;
    container: string;
    hdr: string;
    audio: string;
    stream?: StreamTemplateStreamContext;
    service?: StreamTemplateServiceContext;
}
