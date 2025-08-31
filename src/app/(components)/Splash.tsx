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
    <div className="fixed inset-0 bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <div className="text-xl font-semibold mb-6">Skyll for å finne</div>
        <button
          onClick={onClick}
          className="relative overflow-hidden rounded-2xl bg-white text-black px-8 py-4 shadow-lg active:scale-[0.98] transition"
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

