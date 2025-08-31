"use client";
import { Menu } from "lucide-react";
import { useState } from "react";
import { MenuSheet } from "./MenuSheet";

export function TopBar() {
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
      <div className="pointer-events-none select-none text-sm font-semibold tracking-wide bg-white/90 backdrop-blur text-black rounded-2xl px-4 py-2 shadow-lg">
        Flush Radar
      </div>
      <div className="w-[44px]" />
      <MenuSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}

