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
    html: `<div class=\"marker-pin\"><svg class=\"glyph\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\"><rect x=\"5\" y=\"3\" width=\"8\" height=\"7\" rx=\"1.5\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"currentColor\" /><path d=\"M9 10v4a4 4 0 0 0 4 4h3\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" /><path d=\"M6 10h10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"currentColor\" /><circle cx=\"7.5\" cy=\"6.5\" r=\"0.9\" fill=\"white\" /><path d=\"M7 18h9.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" /></svg></div>`,
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

