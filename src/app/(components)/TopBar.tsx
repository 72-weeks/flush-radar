"use client";
import { List, Map as MapIcon, Menu } from "lucide-react";
import { useState } from "react";
import { MenuSheet } from "./MenuSheet";
type Mode = "map" | "list";

export function TopBar({ mode = "map", onToggle }: { mode?: Mode; onToggle?: (m: Mode) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed top-0 left-0 right-0 z-[1100] flex items-center justify-between px-4 py-3">
      <button
        aria-label="Meny"
        onClick={() => setOpen(true)}
        className="rounded-2xl bg-white text-black shadow-lg px-3 py-2"
      >
        <Menu size={20} />
      </button>
      <div className="flex items-center gap-2">
        <div className="pointer-events-none select-none text-sm font-semibold tracking-wide bg-white/90 backdrop-blur text-black rounded-2xl px-4 py-2 shadow-lg">
          Flush Radar
        </div>
        <button
          aria-label="Bytt visning"
          onClick={() => onToggle?.(mode === "map" ? "list" : "map")}
          className="rounded-2xl bg-white text-black shadow-lg px-3 py-2"
        >
          {mode === "map" ? <List size={18} /> : <MapIcon size={18} />}
        </button>
      </div>
      <div className="w-[44px]" />
      <MenuSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}

