Flush Radar – en PWA for å finne offentlige toaletter i Oslo.

## Kom i gang

Installer avhengigheter og start dev-serveren:

```bash
pnpm install
pnpm dev
```

Åpne http://localhost:3000 i nettleseren.

## Teknologi
- Next.js App Router + React
- Tailwind CSS
- Framer Motion
- Leaflet + OpenStreetMap
- lucide-react
- Radix UI (Dialog)
- PWA manifest + service worker (app-shell og OSM-tiles caches)

## Data
Lokal mock-data for toaletter i Oslo. Favoritter og konto-stub lagres i `localStorage`.

Bytte til Supabase senere: lag API-ruter for toaletter og vurderinger, erstatt lokale CRUD fra `app/(lib)` med fetch-kall.

## Akseptansekriterier (utdrag)
- Splash med "Skyll for å finne" og geolokasjon.
- Kart sentrert på bruker med pulserende prikk og radar-overlay.
- Markører med bunnark for info, rating (skylt-ikoner), favoritt, og veibeskrivelse.
- Vurderingsprompt innen 50 m som oppdaterer lokal gjennomsnittsrating.
- Meny med Konto, Legg til toalett, Favoritter.
- PWA installasjon og offline for app-shell + OSM-tiles.
