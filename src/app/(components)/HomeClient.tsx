"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Splash } from "./Splash";
import { TopBar } from "./TopBar";
import { ListView } from "./ListView";

const DynamicMapView = dynamic(() => import("./MapView").then(m => m.MapView), { ssr: false });

export default function HomeClient() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [mode, setMode] = useState<"map" | "list">("map");
  return (
    <div className="fixed inset-0">
      {!pos ? (
        <Splash onGeolocated={(p)=> setPos({ lat: p.coords.latitude, lng: p.coords.longitude })} />
      ) : (
        <>
          <TopBar mode={mode} onToggle={setMode} />
          {mode === "map" ? (
            <DynamicMapView initial={pos} />
          ) : (
            <ListView current={pos} onSelect={(t, d)=>{
              // Open map + sheet for tapped item
              setMode("map");
              // Let MapView open through global event; fallback to alert directions soon if needed
              window.dispatchEvent(new CustomEvent("flushradar:focus", { detail: { id: t.id, distance: d } }));
            }} />
          )}
        </>
      )}
    </div>
  );
}

