export interface RankedMatchResult {
    propertyId: string;
    addressLine: string;
    previewImageUrl: string;
    distanceMeters: number;
    confidence: number;
    confidenceLabel: 'low' | 'medium' | 'high' | 'very_high';
    reasons: string[];
    metadata: {
        visualScore: number;
        geoScore: number;
        metadataScore: number;
    };
}
export interface SearchResponsePayload {
    matches: RankedMatchResult[];
    candidateCount: number;
    radiusMeters: number;
    baseRadiusMeters: number;
    expansionLevel: number;
    status: 'matches' | 'expanded' | 'none';
    nextActionToken?: string;
}
export interface DeviceLocation {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
}
//# sourceMappingURL=types.d.ts.map