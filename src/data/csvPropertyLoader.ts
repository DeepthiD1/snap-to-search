import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

import { PropertyCandidate } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('CsvPropertyLoader');

interface CsvRow {
  propertyId?: string;
  property_id?: string;
  mlsId?: string;
  addressLine?: string;
  latitude?: string;
  longitude?: string;
  lat?: string;
  lon?: string;
  previewImageUrl?: string;
  image_url?: string;
  galleryImageUrls?: string;
  propertyType?: string;
  type?: string;
  stories?: string;
  garage?: string;
  exteriorColor?: string;
  roofStyle?: string;
  porch?: string;
  notes?: string;
  view?: string;
}

type PropertyType = PropertyCandidate['features']['propertyType'];
type RoofStyle = PropertyCandidate['features']['roofStyle'];

export function loadPropertiesFromCsv(filePath: string): PropertyCandidate[] {
  const absolutePath = path.resolve(filePath);
  try {
    const csv = fs.readFileSync(absolutePath, 'utf-8');
    const rows = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];

    const properties = rows
      .map((row) => toPropertyCandidate(row))
      .filter((property): property is PropertyCandidate => Boolean(property));

    logger.info('Loaded dataset entries from CSV', {
      path: absolutePath,
      count: properties.length,
    });

    return properties;
  } catch (error) {
    logger.error('Failed to load dataset from CSV', { path: absolutePath, error });
    throw new Error(`Unable to load dataset file at ${absolutePath}`);
  }
}

function toPropertyCandidate(row: CsvRow): PropertyCandidate | null {
  const propertyId = row.propertyId ?? row.property_id;
  const previewImageUrl = row.previewImageUrl ?? row.image_url;

  if (!propertyId || !previewImageUrl) {
    return null;
  }

  const galleryImageUrls = parseGallery(row.galleryImageUrls);
  if (!galleryImageUrls.length) {
    galleryImageUrls.push(previewImageUrl);
  }

  return {
    propertyId,
    mlsId: row.mlsId ?? propertyId,
    addressLine: row.addressLine ?? buildAddress(propertyId, row.view),
    latitude: parseNumber(row.latitude ?? row.lat),
    longitude: parseNumber(row.longitude ?? row.lon),
    previewImageUrl,
    galleryImageUrls,
    features: {
      propertyType: parsePropertyType(row.propertyType ?? row.type),
      stories: parseNumber(row.stories, 1),
      garage: parseBoolean(row.garage),
      exteriorColor: row.exteriorColor ?? 'unknown',
      roofStyle: parseRoofStyle(row.roofStyle),
      porch: parseBoolean(row.porch),
      notes: buildNotes(row),
    },
  };
}

function parseNumber(value?: string | number, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value?: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return value.trim().toLowerCase() === 'true';
}

function parseGallery(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split('|')
    .flatMap((segment) => segment.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAddress(propertyId: string, view?: string): string {
  if (view) {
    const formatted = view.replace(/_/g, ' ');
    return `${propertyId} (${formatted})`;
  }
  return propertyId;
}

function buildNotes(row: CsvRow): string | undefined {
  const notes: string[] = [];
  if (row.type) {
    notes.push(`Source type: ${row.type}`);
  }
  if (row.view) {
    notes.push(`View: ${row.view}`);
  }
  if (row.notes) {
    notes.push(row.notes);
  }
  return notes.length ? notes.join(' | ') : undefined;
}

function parsePropertyType(value?: string): PropertyType {
  if (!value) {
    return 'single_family';
  }

  const normalized = value.toLowerCase();
  if (normalized.includes('condo') || normalized.includes('apartment')) {
    return 'condo';
  }
  if (normalized.includes('townhome')) {
    return 'townhome';
  }
  return 'single_family';
}

function parseRoofStyle(value?: string): RoofStyle {
  if (!value) {
    return 'gable';
  }
  if (value === 'gable' || value === 'hip' || value === 'flat' || value === 'mansard') {
    return value;
  }
  return 'gable';
}
