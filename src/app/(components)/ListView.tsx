"use client";
import { useMemo } from "react";
import { listToilets, Toilet } from "@/app/(lib)/toilets";
import { haversineMeters, bearingDegrees, estimateTtpSeconds, formatTtp, formatDistance } from "@/app/(lib)/geo";

type Props = {
  current: { lat: number; lng: number };
  onSelect: (t: Toilet, distance: number) => void;
};

export function ListView({ current, onSelect }: Props) {
  const items = useMemo(() => {
    return listToilets().map(t => {
      const d = haversineMeters(current, t.coords);
      const brng = bearingDegrees(current, t.coords);
      const ttp = estimateTtpSeconds(d);
      return { t, d, brng, ttp };
    }).sort((a,b) => a.ttp - b.ttp);
  }, [current]);

  return (
    <div className="absolute inset-0 overflow-auto pt-16 pb-24 bg-white">
      <ul className="divide-y divide-zinc-200">
        {items.map(({ t, d, brng, ttp }) => (
          <li key={t.id} className="p-4 flex items-center justify-between gap-3" onClick={() => onSelect(t, d)}>
            <div className="flex items-center gap-3">
              <DirectionArrow deg={brng} />
              <div>
                <div className="text-sm font-semibold">{t.name || 'Offentlig toalett'}</div>
                <div className="text-xs text-zinc-600">TTP {formatTtp(ttp)} • {formatDistance(d)} • {(t.avgRating).toFixed(1)}/5</div>
              </div>
            </div>
            <div className="text-xs text-zinc-700">{t.hours || ''}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DirectionArrow({ deg }: { deg: number }) {
  return (
    <div className="w-8 h-8 rounded-full border border-zinc-300 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" style={{ transform: `rotate(${deg}deg)` }} aria-hidden>
        <path d="M12 3l5 9h-3v9h-4v-9H7l5-9z" fill="black" />
      </svg>
    </div>
  );
}

