export type NearbyPhoto = {
  title: string;
  imageUrl: string;
  thumbUrl: string;
  author?: string;
  license?: string;
  pageUrl?: string;
};

// Fetch a geotagged Wikimedia Commons image near the coordinate (no API key).
// Returns the first decent thumbnail if available.
export async function fetchNearbyCommonsPhoto(lat: number, lng: number, radiusMeters = 400): Promise<NearbyPhoto | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'geosearch',
    ggscoord: `${lat}|${lng}`,
    ggsradius: String(radiusMeters),
    ggslimit: '20',
    ggsnamespace: '6', // File: namespace
    prop: 'imageinfo|coordinates|info',
    inprop: 'url',
    iiprop: 'url|extmetadata',
    iiurlwidth: '960',
  });

  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: {
      query?: {
        pages?: Record<string, {
          title?: string;
          fullurl?: string;
          imageinfo?: Array<{
            url?: string;
            thumburl?: string;
            extmetadata?: Record<string, { value?: string }>;
          }>;
        }>;
      };
    } = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;

    const candidates = Object.values(pages);
    for (const p of candidates) {
      const ii = p?.imageinfo?.[0];
      if (!ii) continue;
      const ext = ii.extmetadata || {};
      const title: string = (p.title || '').replace(/^File:/, '') || 'Foto';
      const author: string | undefined = (ext.Artist?.value || '').replace(/<[^>]+>/g, '') || undefined;
      const license: string | undefined = ext.LicenseShortName?.value || undefined;
      const imageUrl: string | undefined = ii.url;
      const thumbUrl: string | undefined = ii.thumburl || imageUrl;
      const pageUrl: string | undefined = p.fullurl || (p.title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}` : undefined);
      if (thumbUrl && imageUrl) {
        return { title, imageUrl, thumbUrl, author, license, pageUrl };
      }
    }
    return null;
  } catch {
    return null;
  }
}

