"use client";
import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";

type Props = {
  position: [number, number];
  title: string;
  onClick?: () => void;
};

export function ToiletMarker({ position, title, onClick }: Props) {
  const icon = useMemo(() => new L.DivIcon({
    className: "",
    html: `<div class=\"marker-pin\"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  }), []);

  return (
    // We'll visually render icon via CSS and an inline SVG shadow-root replacement
    <Marker position={position} icon={icon} eventHandlers={{ click: onClick ? () => onClick() : undefined }}>
      <Tooltip>{title}</Tooltip>
    </Marker>
  );
}

