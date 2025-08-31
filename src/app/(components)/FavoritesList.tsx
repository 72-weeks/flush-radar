"use client";
import { getUser } from "@/app/(lib)/storage";
import { findToilet } from "@/app/(lib)/toilets";

type Props = { onSelect: (id: string) => void };

export function FavoritesList({ onSelect }: Props) {
  const u = typeof window !== 'undefined' ? getUser() : { favorites: [], id: 'server' };
  if (!u.favorites.length) return <div className="text-sm text-zinc-600">Ingen favoritter ennå.</div>;
  return (
    <div className="space-y-2">
      {u.favorites.map((id) => {
        const t = findToilet(id);
        if (!t) return null;
        return (
          <button key={id} onClick={()=>onSelect(id)} className="w-full text-left text-sm p-3 border border-zinc-200 rounded-xl hover:bg-zinc-50">
            {t.name || 'Offentlig toalett'}
          </button>
        );
      })}
    </div>
  );
}

