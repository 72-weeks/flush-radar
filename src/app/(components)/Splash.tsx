"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

type Props = { onGeolocated: (pos: GeolocationPosition) => void };

export function Splash({ onGeolocated }: Props) {
  const [flushing, setFlushing] = useState(false);
  const onClick = () => {
    setFlushing(true);
    setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => onGeolocated(pos),
        () => setFlushing(false),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 8000 }
      );
    }, 150);
  };
  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      <div className="flex-1 grid place-items-center px-6 text-center">
        <div>
          <div className="text-5xl mb-4">🚽</div>
          <div className="text-xl font-semibold">Skyll for å finne</div>
        </div>
      </div>
      <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <button
          onClick={onClick}
          className="relative w-full overflow-hidden rounded-2xl bg-white text-black px-6 py-4 shadow-lg active:scale-[0.99] transition"
        >
          Skyll
          <AnimatePresence>
            {flushing && (
              <motion.span
                initial={{ scale: 0.5, opacity: 0.3 }}
                animate={{ scale: 2.4, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0 rounded-2xl bg-white"
                style={{ mixBlendMode: "overlay" }}
              />
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}

