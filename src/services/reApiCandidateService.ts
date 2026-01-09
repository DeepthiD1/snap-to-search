import fetch from 'node-fetch';
import { createLogger } from '../utils/logger';

const logger = createLogger('ReApiCandidateService');

export type ReApiCandidate = {
  propertyId: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  addressLabel?: string;
  listing?: Record<string, any>;
};

export class ReApiCandidateService {
  constructor(
    private baseUrl: string | undefined,
    private apiKey: string | undefined
  ) {}

  async mlsSearchByRadius(params: {
    latitude: number;
    longitude: number;
    radiusMiles?: number;
    size?: number;
    active?: boolean;
  }): Promise<ReApiCandidate[]> {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('Missing RE_API_BASE or RE_API_KEY');
    }

    const radius = Math.max(0.1, Math.min(10, params.radiusMiles ?? 1));
    const payload: any = {
      latitude: params.latitude,
      longitude: params.longitude,
      radius,
      size: params.size ?? 50,
      active: params.active ?? true,
      sold: false,
      bathrooms_min: 1,
      bedrooms_min: 1,
      listing_property_type: 'RESIDENTIAL',
    };

    const r = await fetch(`${this.baseUrl}/v2/MLSSearch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();

    if (!r.ok) {
      logger.warn('MLSSearch failed', { status: r.status, data });
      throw new Error(`MLSSearch failed: ${r.status}`);
    }

    const results = (data?.data ?? []) as any[];

    return results
      .map((item) => {
        const listing = item?.listing ?? {};
        const address = listing?.address ?? {};
        const prop = listing?.property ?? {};
        const media = listing?.media ?? {};
        const pid = item?.listingId ?? listing?.mlsNumber ?? item?.id;

      const leadTypes = listing?.leadTypes ?? {};
      const status = (listing?.standardStatus ?? '').toString().toLowerCase();
      const isSold =
        leadTypes.mlsSold === true ||
        leadTypes.mlsStatus === 'sold' ||
        status === 'sold' ||
        status === 'closed';

      if (isSold) {
        return null;
      }

      return {
        propertyId: String(pid),
        latitude: typeof prop?.latitude === 'number' ? prop.latitude : undefined,
        longitude: typeof prop?.longitude === 'number' ? prop.longitude : undefined,
        imageUrl: media?.primaryListingImageUrl ?? listing?.public?.imageUrl ?? undefined,
        addressLabel: address?.unparsedAddress
          ? `${address.unparsedAddress}, ${address.city ?? ''} ${address.stateOrProvince ?? ''} ${address.zipCode ?? ''}`.trim()
          : undefined,
        listing,
      } as ReApiCandidate;
      })
      .filter((c): c is ReApiCandidate => !!(c && c.propertyId));
  }
}
