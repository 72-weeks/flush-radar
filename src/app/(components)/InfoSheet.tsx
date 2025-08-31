"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Star } from "lucide-react";
import { Toilet } from "@/app/(lib)/toilets";
import { formatDistance } from "@/app/(lib)/geo";
import { isFavorite, toggleFavorite } from "@/app/(lib)/storage";
import { ToiletIcon } from "@/app/(icons)/ToiletIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchNearbyCommonsPhoto } from "@/app/(lib)/photos";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  toilet?: Toilet | null;
  distance?: number;
};

export function InfoSheet({ open, onOpenChange, toilet, distance }: Props) {
  const [fav, setFav] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; title: string; author?: string; license?: string; pageUrl?: string } | null>(null);
  const startYRef = useRef<number | null>(null);
  const dragYRef = useRef<number>(0);
  const [dragY, setDragY] = useState(0);
  useEffect(() => {
    if (toilet) setFav(isFavorite(toilet.id));
  }, [toilet]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!toilet) { setPhoto(null); return; }
      const { lat, lng } = toilet.coords;
      const p = await fetchNearbyCommonsPhoto(lat, lng, 500);
      if (!active) return;
      if (p) setPhoto({ url: p.thumbUrl, title: p.title, author: p.author, license: p.license, pageUrl: p.pageUrl });
      else setPhoto(null);
    })();
    return () => { active = false; };
  }, [toilet]);

  const ratingIcons = useMemo(() => {
    const full = Math.round(toilet?.avgRating ?? 0);
    return new Array(5).fill(0).map((_, i) => (
      <ToiletIcon key={i} size={16} filled={i < full} className="text-black" />
    ));
  }, [toilet?.avgRating]);

  if (!toilet) return null;
  const openDirections = () => {
    const { lat, lng } = toilet.coords;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS
      ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    window.open(url, "_blank");
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!open) return;
    startYRef.current = e.touches[0]?.clientY ?? null;
    dragYRef.current = 0;
    setDragY(0);
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startYRef.current == null) return;
    const current = e.touches[0]?.clientY ?? 0;
    const delta = Math.max(0, current - startYRef.current);
    dragYRef.current = delta;
    setDragY(delta);
    if (delta > 0) e.preventDefault();
  };

  const onTouchEnd = () => {
    const threshold = 60;
    if (dragYRef.current > threshold) {
      onOpenChange(false);
    }
    startYRef.current = null;
    dragYRef.current = 0;
    setDragY(0);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/20 z-[1050]" />
        <Dialog.Content
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="fixed inset-x-0 bottom-0 z-[1100] rounded-t-2xl bg-white shadow-xl p-4 pb-20 max-h-[80vh]"
          style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? undefined : "transform 0.2s ease-out", willChange: "transform" }}
        >
          <Dialog.Title className="sr-only">Toalettinformasjon</Dialog.Title>
          <div className="mx-auto mt-1 mb-2 h-1 w-10 rounded-full bg-zinc-300" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold">{toilet.name || "Offentlig toalett"}</div>
              <div className="text-xs text-zinc-600 mt-1">{typeof distance === 'number' ? formatDistance(distance) : null}</div>
            </div>
            <button
              aria-label="Favoritt"
              onClick={() => { setFav(!fav); toggleFavorite(toilet.id); }}
              className={`rounded-2xl px-3 py-2 shadow-lg ${fav ? 'bg-black text-white' : 'bg-white text-black'}`}
            >
              <Star size={16} className={fav ? 'fill-white' : ''} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-1">{ratingIcons}</div>
            <div className="text-xs text-zinc-700">{(toilet.avgRating).toFixed(1)}/5 skyll</div>
          </div>
          {photo && (
            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.title} className="w-full h-[160px] object-cover" />
              <div className="px-3 py-2 text-[11px] text-zinc-600 flex items-center justify-between">
                <span>{photo.title}{photo.author ? ` — ${photo.author}` : ''}</span>
                {photo.pageUrl && (
                  <a href={photo.pageUrl} target="_blank" rel="noreferrer" className="underline">Kilde</a>
                )}
              </div>
            </div>
          )}
          <p className="mt-3 text-sm text-zinc-800 leading-snug">{toilet.synthesizedReview}</p>
          {toilet.hours && (
            <div className="mt-2 text-xs text-zinc-600">Åpningstider: {toilet.hours}</div>
          )}
          <div className="mt-4">
            <button
              onClick={openDirections}
              className="w-full rounded-2xl bg-black text-white px-4 py-3 shadow-lg active:scale-[0.99]"
            >
              Åpne veibeskrivelse
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

