export type User = { id: string; displayName?: string; favorites: string[] };

const USER_KEY = "flushradar_user";

export function getUser(): User {
  if (typeof window === "undefined") return { id: "server", favorites: [] };
  const raw = localStorage.getItem(USER_KEY);
  if (raw) {
    try { return JSON.parse(raw) as User; } catch {}
  }
  const id = cryptoRandomId();
  const user: User = { id, favorites: [] };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export function updateUser(update: Partial<User>): User {
  const current = getUser();
  const next = { ...current, ...update } as User;
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  return next;
}

export function toggleFavorite(id: string): User {
  const u = getUser();
  const set = new Set(u.favorites);
  if (set.has(id)) set.delete(id); else set.add(id);
  return updateUser({ favorites: Array.from(set) });
}

export function isFavorite(id: string): boolean {
  const u = getUser();
  return u.favorites.includes(id);
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    const c = crypto as unknown as { randomUUID?: () => string };
    if (c.randomUUID) return c.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

