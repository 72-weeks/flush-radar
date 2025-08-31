"use client";
import { useState } from "react";
import { Splash } from "./(components)/Splash";
import { TopBar } from "./(components)/TopBar";
import dynamic from "next/dynamic";

const DynamicMapView = dynamic(() => import("./(components)/MapView").then(m => m.MapView), { ssr: false });

export default function Home() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  return (
    <div className="fixed inset-0">
      {!pos && <Splash onGeolocated={(p)=> setPos({ lat: p.coords.latitude, lng: p.coords.longitude })} />}
      {pos && (
        <>
          <TopBar />
          <DynamicMapView initial={pos} />
        </>
      )}
    </div>
  );
}
