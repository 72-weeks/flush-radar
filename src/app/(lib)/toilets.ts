import { synthReview } from "./synth";

export type Toilet = {
  id: string;
  name?: string;
  coords: { lat: number; lng: number };
  avgRating: number; // 0–5
  ratingsCount: number;
  synthesizedReview: string; // 120–180 chars
  hours?: string;
};

export type Review = { toiletId: string; rating: number; text?: string; createdAt: number };

const SEED: Toilet[] = [
  { id: "sentrum-1", name: "Offentlig toalett – Sentrum", coords: { lat: 59.9139, lng: 10.7522 }, avgRating: 4.2, ratingsCount: 23, synthesizedReview: "Rent og lett å finne, men litt kø i rushtiden.", hours: "08–22" },
  { id: "frogner-1", name: "Frognerparken", coords: { lat: 59.9267, lng: 10.7003 }, avgRating: 4.5, ratingsCount: 31, synthesizedReview: "God tilgjengelighet og papir på plass.", hours: "08–20" },
  { id: "grl-1", name: "Grünerløkka plass", coords: { lat: 59.9230, lng: 10.7590 }, avgRating: 4.1, ratingsCount: 18, synthesizedReview: "Trangt, men rent. Fint for barnevogn.", hours: "07–23" },
  { id: "majorstuen-1", name: "Majorstuen t-bane", coords: { lat: 59.9355, lng: 10.7120 }, avgRating: 3.9, ratingsCount: 40, synthesizedReview: "Litt slitt, men greit ved behov.", hours: "06–24" },
  { id: "bislett-1", name: "Bislett stadion", coords: { lat: 59.9291, lng: 10.7336 }, avgRating: 4.0, ratingsCount: 16, synthesizedReview: "Ryddig og grei lukt. Enkel adkomst.", hours: "08–22" },
  { id: "tjuvholmen-1", name: "Tjuvholmen brygge", coords: { lat: 59.9087, lng: 10.7209 }, avgRating: 4.7, ratingsCount: 28, synthesizedReview: "Rent og moderne, flott beliggenhet.", hours: "09–22" },
  { id: "akerbrygge-1", name: "Aker brygge kiosk", coords: { lat: 59.9097, lng: 10.7340 }, avgRating: 4.3, ratingsCount: 19, synthesizedReview: "Hyggelig og rent, litt kø på kvelden.", hours: "10–22" },
  { id: "national-1", name: "Nasjonalteatret stasjon", coords: { lat: 59.9142, lng: 10.7336 }, avgRating: 3.8, ratingsCount: 35, synthesizedReview: "Travelt, men fungerer fint.", hours: "06–24" },
  { id: "youngstorget-1", name: "Youngstorget", coords: { lat: 59.9156, lng: 10.7517 }, avgRating: 4.6, ratingsCount: 22, synthesizedReview: "Overraskende rent og rolig.", hours: "08–22" },
  { id: "st-hans-1", name: "St. Hanshaugen park", coords: { lat: 59.9287, lng: 10.7440 }, avgRating: 4.4, ratingsCount: 12, synthesizedReview: "Rolig og pent vedlikeholdt.", hours: "09–21" },
  { id: "skog-1", name: "Solli plass", coords: { lat: 59.9169, lng: 10.7161 }, avgRating: 3.6, ratingsCount: 14, synthesizedReview: "Greit nok, kunne vært bedre merket.", hours: "08–22" },
  { id: "opera-1", name: "Operaen området", coords: { lat: 59.9075, lng: 10.7531 }, avgRating: 4.9, ratingsCount: 45, synthesizedReview: "Rent og lett tilgjengelig, topp utsikt.", hours: "08–22" },
];

let toilets: Toilet[] = [...SEED];
const reviews: Review[] = [];

export function listToilets() {
  return toilets;
}

export function addToilet(input: Partial<Toilet> & { coords: { lat: number; lng: number } }): Toilet {
  const id = input.id || `loc-${Math.random().toString(36).slice(2, 9)}`;
  const item: Toilet = {
    id,
    name: input.name || "Offentlig toalett",
    coords: input.coords,
    avgRating: input.avgRating ?? 4.2,
    ratingsCount: input.ratingsCount ?? 0,
    synthesizedReview: input.synthesizedReview || synthReview(input.name),
    hours: input.hours,
  };
  toilets = [item, ...toilets];
  return item;
}

export function addReview(toiletId: string, rating: number, text?: string) {
  const t = toilets.find((x) => x.id === toiletId);
  if (!t) return;
  t.avgRating = (t.avgRating * t.ratingsCount + rating) / (t.ratingsCount + 1);
  t.ratingsCount += 1;
  if (!text && Math.random() < 0.7) {
    t.synthesizedReview = synthReview(t.name);
  }
  reviews.push({ toiletId, rating, text, createdAt: Date.now() });
}

export function findToilet(id: string) {
  return toilets.find((t) => t.id === id);
}

