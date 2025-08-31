"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Splash } from "./Splash";
import { TopBar } from "./TopBar";

const DynamicMapView = dynamic(() => import("./MapView").then(m => m.MapView), { ssr: false });

export default function HomeClient() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  return (
    <div className="fixed inset-0">
      {!pos ? (
        <Splash onGeolocated={(p)=> setPos({ lat: p.coords.latitude, lng: p.coords.longitude })} />
      ) : (
        <>
          <TopBar />
          <DynamicMapView initial={pos} />
        </>
      )}
    </div>
  );
}

