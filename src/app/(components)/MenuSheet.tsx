"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { getUser, updateUser } from "@/app/(lib)/storage";
import { FavoritesList } from "./FavoritesList";
import { AddToiletForm } from "./AddToiletForm";
import { useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  getMapCenter?: () => { lat: number; lng: number } | null;
  current?: { lat: number; lng: number } | null;
  focusToilet?: (id: string) => void;
};

export function MenuSheet({ open, onOpenChange, getMapCenter, current, focusToilet }: Props) {
  const u = typeof window !== 'undefined' ? getUser() : { id: 'server', favorites: [] };
  const [tab, setTab] = useState<'konto' | 'leggtil' | 'favoritter'>('konto');
  const [name, setName] = useState(u.displayName || "");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/20" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-xl p-4 max-h-[80vh] overflow-auto">
          <Dialog.Title className="sr-only">Meny</Dialog.Title>
          <div className="flex gap-2 mb-3 text-sm">
            <button onClick={()=>setTab('konto')} className={`px-3 py-2 rounded-2xl ${tab==='konto'?'bg-black text-white':'bg-zinc-100'}`}>Konto</button>
            <button onClick={()=>setTab('leggtil')} className={`px-3 py-2 rounded-2xl ${tab==='leggtil'?'bg-black text-white':'bg-zinc-100'}`}>Legg til toalett</button>
            <button onClick={()=>setTab('favoritter')} className={`px-3 py-2 rounded-2xl ${tab==='favoritter'?'bg-black text-white':'bg-zinc-100'}`}>Favoritter</button>
          </div>
          {tab === 'konto' && (
            <div>
              <div className="text-sm mb-2">Enhets-ID: <span className="font-mono text-zinc-700">{u.id}</span></div>
              <label className="text-sm block mb-1">Visningsnavn</label>
              <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Navn" className="w-full text-sm p-2 border border-zinc-200 rounded-xl" />
              <button onClick={()=>updateUser({ displayName: name || undefined })} className="mt-2 rounded-2xl bg-black text-white px-4 py-2">Lagre</button>
            </div>
          )}
          {tab === 'leggtil' && (
            <AddToiletForm getMapCenter={getMapCenter} current={current} onAdded={(id)=>focusToilet?.(id)} />
          )}
          {tab === 'favoritter' && (
            <FavoritesList onSelect={(id)=>{ focusToilet?.(id); onOpenChange(false); }} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

