export type LocationSource = 'device' | 'exif';

export interface RawLocationInput {
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  source?: LocationSource;
}

export interface NormalizedLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  source: LocationSource;
}

export interface SnapRequestMetadata {
  sessionId: string;
  userLabel?: string;
  hints?: string[];
}

export interface SnapToSearchRequest {
  photo: Buffer;
  deviceLocation?: RawLocationInput;
  exifLocation?: RawLocationInput;
  metadata: SnapRequestMetadata;
  radiusOverrideMeters?: number;
  expansionLevel?: number;
}

export interface PropertyCandidate {
  propertyId: string;
  mlsId: string;
  addressLine: string;
  latitude: number;
  longitude: number;
  previewImageUrl: string;
  galleryImageUrls: string[];
  features: {
    propertyType: 'single_family' | 'townhome' | 'condo';
    stories: number;
    garage: boolean;
    exteriorColor: string;
    roofStyle: 'gable' | 'hip' | 'flat' | 'mansard';
    porch: boolean;
    notes?: string;
  };
}

export interface CandidateWithDistance extends PropertyCandidate {
  distanceMeters: number;
}

export interface VisualMatchCandidate extends CandidateWithDistance {
  visualScore: number; // 0-1
  cues: string[];
}

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

export type SearchResponseStatus = 'matches' | 'expanded' | 'none';

export interface SearchResponse {
  matches: RankedMatchResult[];
  candidateCount: number;
  radiusMeters?: number;
  baseRadiusMeters?: number;
  expansionLevel: number;
  usedLocation?: NormalizedLocation;
  status: SearchResponseStatus;
}

export interface SearchSessionRecord {
  token: string;
  sessionId: string;
  createdAt: Date;
  updatedAt: Date;
  photo: Buffer;
  deviceLocation?: RawLocationInput;
  exifLocation?: RawLocationInput;
  normalizedLocation?: NormalizedLocation;
  baseRadiusMeters?: number;
  expansionLevel: number;
  radiusOverrideMeters?: number;
  metadata?: SnapRequestMetadata;
}
