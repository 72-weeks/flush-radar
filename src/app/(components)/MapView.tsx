"use client";
import { MapContainer, TileLayer, useMap, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { listToilets, Toilet } from "@/app/(lib)/toilets";
import { haversineMeters } from "@/app/(lib)/geo";
import { ToiletMarker } from "./ToiletMarker";
import { InfoSheet } from "./InfoSheet";
import { RatePrompt } from "./RatePrompt";

type Props = {
  initial: { lat: number; lng: number };
};

export function MapView({ initial }: Props) {
  const [current, setCurrent] = useState(initial);
  const [selected, setSelected] = useState<Toilet | null>(null);
  const [open, setOpen] = useState(false);
  const [distance, setDistance] = useState<number | undefined>(undefined);
  // no custom map state required

  useEffect(() => {
    const id = navigator.geolocation.watchPosition((pos) => {
      setCurrent({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    });
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const nearby = useMemo(() => {
    const all = listToilets();
    return all
      .map((t) => ({ t, d: haversineMeters(current, t.coords) }))
      .filter(({ d }) => d <= 2000)
      .sort((a, b) => a.d - b.d);
  }, [current]);

  const within50 = selected ? haversineMeters(current, selected.coords) <= 50 : false;

  // focusToilet removed (not needed yet)

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={[current.lat, current.lng]}
        zoom={15}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Recenter position={[current.lat, current.lng]} />
        <CircleMarker center={[current.lat, current.lng]} radius={6} pathOptions={{ color: "#000", fillColor: "#000", fillOpacity: 1 }} />
        {nearby.map(({ t }) => (
          <ToiletMarker key={t.id} position={[t.coords.lat, t.coords.lng]} title={t.name || 'Offentlig toalett'} onClick={()=>{ setSelected(t); setDistance(haversineMeters(current, t.coords)); setOpen(true); }} />
        ))}
      </MapContainer>
      {/* No custom zoom controls; rely on pinch/drag */}
      <InfoSheet open={open} onOpenChange={setOpen} toilet={selected} distance={distance} current={current} />
      {selected && (
        <div className="absolute left-3 right-3 bottom-24 z-[1000]">
          <RatePrompt toilet={selected} visible={within50} onSubmitted={()=>{ /* No-op, sheet shows updated avg next open */ }} />
        </div>
      )}
    </div>
  );
}

function Recenter({ position }: { position: [number, number] }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      map.setView(position);
    }
  }, [position, map]);
  return null;
}

// (Zoom controls removed)

