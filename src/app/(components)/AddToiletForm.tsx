"use client";
import { useState } from "react";
import { addToilet } from "@/app/(lib)/toilets";

type Props = {
  getMapCenter?: () => { lat: number; lng: number } | null;
  current?: { lat: number; lng: number } | null;
  onAdded?: (id: string) => void;
};

export function AddToiletForm({ getMapCenter, current, onAdded }: Props) {
  const [source, setSource] = useState<'current' | 'center'>('current');
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [hours, setHours] = useState("");

  const submit = () => {
    const coords = source === 'current' ? current : getMapCenter?.();
    if (!coords) return;
    const t = addToilet({ name: name || undefined, coords, synthesizedReview: desc || undefined, hours: hours || undefined });
    alert("Takk! Lagt til.");
    onAdded?.(t.id);
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Legg til toalett</div>
      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-2"><input type="radio" name="src" checked={source==='current'} onChange={()=>setSource('current')} /> Nåværende posisjon</label>
        <label className="flex items-center gap-2"><input type="radio" name="src" checked={source==='center'} onChange={()=>setSource('center')} /> Kartets sentrum</label>
      </div>
      <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Navn (valgfritt)" className="w-full text-sm p-2 border border-zinc-200 rounded-xl" />
      <input value={hours} onChange={(e)=>setHours(e.target.value)} placeholder="Åpningstider (valgfritt)" className="w-full text-sm p-2 border border-zinc-200 rounded-xl" />
      <textarea value={desc} onChange={(e)=>setDesc(e.target.value)} rows={3} placeholder="Beskrivelse (valgfritt)" className="w-full text-sm p-2 border border-zinc-200 rounded-xl" />
      <button onClick={submit} className="w-full rounded-2xl bg-black text-white px-4 py-2">Lagre</button>
    </div>
  );
}

