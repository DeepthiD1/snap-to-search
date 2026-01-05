import { PropertyCandidate } from '../types';

export const mockProperties: PropertyCandidate[] = [
  {
    propertyId: 'prop-sil-4821',
    mlsId: 'ML81948210',
    addressLine: '4821 Juniper Ridge Ave, Redwood Shores, CA',
    latitude: 37.524968,
    longitude: -122.251456,
    previewImageUrl: 'https://images.snaphomz.dev/properties/prop-sil-4821/preview.jpg',
    galleryImageUrls: [
      'https://images.snaphomz.dev/properties/prop-sil-4821/front.jpg',
      'https://images.snaphomz.dev/properties/prop-sil-4821/side.jpg'
    ],
    features: {
      propertyType: 'single_family',
      stories: 2,
      garage: true,
      exteriorColor: 'cream',
      roofStyle: 'hip',
      porch: true,
      notes: 'Mediterranean arches and palm landscaping.'
    }
  },
  {
    propertyId: 'prop-sil-4805',
    mlsId: 'ML81948050',
    addressLine: '4805 Juniper Ridge Ave, Redwood Shores, CA',
    latitude: 37.524012,
    longitude: -122.250812,
    previewImageUrl: 'https://images.snaphomz.dev/properties/prop-sil-4805/preview.jpg',
    galleryImageUrls: [
      'https://images.snaphomz.dev/properties/prop-sil-4805/front.jpg'
    ],
    features: {
      propertyType: 'single_family',
      stories: 2,
      garage: true,
      exteriorColor: 'blue-gray',
      roofStyle: 'gable',
      porch: false,
      notes: 'Modern craftsman with dormer windows.'
    }
  },
  {
    propertyId: 'prop-sil-221',
    mlsId: 'ML81922100',
    addressLine: '221 Bridgewater Ct, Redwood City, CA',
    latitude: 37.52185,
    longitude: -122.25112,
    previewImageUrl: 'https://images.snaphomz.dev/properties/prop-sil-221/preview.jpg',
    galleryImageUrls: [
      'https://images.snaphomz.dev/properties/prop-sil-221/front.jpg'
    ],
    features: {
      propertyType: 'townhome',
      stories: 3,
      garage: true,
      exteriorColor: 'sand',
      roofStyle: 'flat',
      porch: false,
      notes: 'Row of repeating balconies and red doors.'
    }
  },
  {
    propertyId: 'prop-sil-65',
    mlsId: 'ML81965000',
    addressLine: '65 Seaport Blvd, Redwood City, CA',
    latitude: 37.52024,
    longitude: -122.24971,
    previewImageUrl: 'https://images.snaphomz.dev/properties/prop-sil-65/preview.jpg',
    galleryImageUrls: [
      'https://images.snaphomz.dev/properties/prop-sil-65/front.jpg'
    ],
    features: {
      propertyType: 'condo',
      stories: 1,
      garage: false,
      exteriorColor: 'white',
      roofStyle: 'flat',
      porch: false,
      notes: 'Stacked glass balconies and metal siding.'
    }
  },
  {
    propertyId: 'prop-sil-677',
    mlsId: 'ML81967700',
    addressLine: '677 Waterside Cir, Redwood City, CA',
    latitude: 37.52311,
    longitude: -122.2479,
    previewImageUrl: 'https://images.snaphomz.dev/properties/prop-sil-677/preview.jpg',
    galleryImageUrls: [
      'https://images.snaphomz.dev/properties/prop-sil-677/front.jpg'
    ],
    features: {
      propertyType: 'single_family',
      stories: 2,
      garage: true,
      exteriorColor: 'yellow',
      roofStyle: 'gable',
      porch: true,
      notes: 'Corner lot with wrap-around porch.'
    }
  }
];
