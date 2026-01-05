import { NormalizedLocation, RawLocationInput, SearchSessionRecord, SnapRequestMetadata } from '../types';
import { randomUUID } from 'crypto';

interface CreateSessionOptions {
  photo: Buffer;
  sessionId: string;
  deviceLocation?: RawLocationInput;
  exifLocation?: RawLocationInput;
  radiusOverrideMeters?: number;
  metadata?: SnapRequestMetadata;
}

interface UpdateRunMetadataOptions {
  token: string;
  normalizedLocation?: NormalizedLocation;
  baseRadiusMeters?: number;
  expansionLevel: number;
}

export class InMemorySessionStore {
  private readonly sessions = new Map<string, SearchSessionRecord>();

  createSession(options: CreateSessionOptions): string {
    const token = randomUUID();
    const now = new Date();
    const record: SearchSessionRecord = {
      token,
      sessionId: options.sessionId,
      photo: options.photo,
      deviceLocation: options.deviceLocation,
      exifLocation: options.exifLocation,
      radiusOverrideMeters: options.radiusOverrideMeters,
      metadata: options.metadata,
      createdAt: now,
      updatedAt: now,
      expansionLevel: 0,
    };
    this.sessions.set(token, record);
    return token;
  }

  updateRunMetadata(options: UpdateRunMetadataOptions): void {
    const record = this.sessions.get(options.token);
    if (!record) {
      return;
    }

    if (options.normalizedLocation) {
      record.normalizedLocation = options.normalizedLocation;
    }
    if (typeof options.baseRadiusMeters === 'number') {
      record.baseRadiusMeters = options.baseRadiusMeters;
    }
    record.expansionLevel = options.expansionLevel;
    record.updatedAt = new Date();
  }

  get(token: string): SearchSessionRecord | undefined {
    return this.sessions.get(token);
  }
}
