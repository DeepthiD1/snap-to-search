import { NormalizedLocation, RawLocationInput } from '../types';

const MIN_RADIUS_METERS = 200;
const MAX_INITIAL_RADIUS_METERS = 500;
const EXPANSION_STEP_METERS = 250;
const MAX_RADIUS_METERS = 1000;

export interface RadiusComputation {
  baseRadiusMeters: number;
  radiusMeters: number;
}

const EARTH_RADIUS_METERS = 6371e3;

export function isValidCoordinate(location?: RawLocationInput): location is Required<RawLocationInput> {
  if (!location) {
    return false;
  }

  const { latitude, longitude, accuracyMeters } = location;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    typeof accuracyMeters === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Number.isFinite(accuracyMeters)
  );
}

export function normalizeLocation(
  deviceLocation?: RawLocationInput,
  exifLocation?: RawLocationInput
): NormalizedLocation | undefined {
  if (isValidCoordinate(deviceLocation)) {
    return {
      latitude: deviceLocation.latitude!,
      longitude: deviceLocation.longitude!,
      accuracyMeters: Math.max(deviceLocation.accuracyMeters!, MIN_RADIUS_METERS / 2),
      source: 'device',
    };
  }

  if (isValidCoordinate(exifLocation)) {
    return {
      latitude: exifLocation.latitude!,
      longitude: exifLocation.longitude!,
      accuracyMeters: Math.max(exifLocation.accuracyMeters!, MAX_INITIAL_RADIUS_METERS),
      source: 'exif',
    };
  }

  return undefined;
}

export function deriveBaseRadius(accuracyMeters: number): number {
  const scaled = accuracyMeters * 2;
  return Math.min(Math.max(scaled, MIN_RADIUS_METERS), MAX_INITIAL_RADIUS_METERS);
}

export function computeRadius(
  accuracyMeters?: number,
  expansionLevel = 0,
  radiusOverrideMeters?: number
): RadiusComputation | null {
  if (typeof radiusOverrideMeters === 'number') {
    const baseRadiusMeters = Math.max(radiusOverrideMeters, MIN_RADIUS_METERS);
    const expanded = baseRadiusMeters + expansionLevel * EXPANSION_STEP_METERS;
    return {
      baseRadiusMeters,
      radiusMeters: Math.min(expanded, MAX_RADIUS_METERS),
    };
  }

  if (typeof accuracyMeters !== 'number') {
    return null;
  }

  const baseRadiusMeters = deriveBaseRadius(accuracyMeters);
  const expanded = baseRadiusMeters + expansionLevel * EXPANSION_STEP_METERS;
  const radiusMeters = Math.min(expanded, MAX_RADIUS_METERS);
  return { baseRadiusMeters, radiusMeters };
}

export function haversineDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(latitudeB - latitudeA);
  const dLon = toRad(longitudeB - longitudeA);
  const latARad = toRad(latitudeA);
  const latBRad = toRad(latitudeB);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(latARad) * Math.cos(latBRad);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function distanceBetween(location: NormalizedLocation, target: { latitude: number; longitude: number }): number {
  return haversineDistanceMeters(location.latitude, location.longitude, target.latitude, target.longitude);
}

export const locationConstants = {
  MIN_RADIUS_METERS,
  MAX_INITIAL_RADIUS_METERS,
  EXPANSION_STEP_METERS,
  MAX_RADIUS_METERS,
};
