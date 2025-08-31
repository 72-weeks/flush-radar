"use client";
import * as React from "react";

type Props = React.SVGProps<SVGSVGElement> & { filled?: boolean; size?: 16 | 24 };

export function ToiletIcon({ filled = false, size = 16, ...props }: Props) {
  const s = size;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect x="5" y="3" width="8" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill={filled ? "currentColor" : "none"} />
      <path d="M9 10v4a4 4 0 0 0 4 4h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 10h10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z" stroke="currentColor" strokeWidth="1.5" fill={filled ? "currentColor" : "none"} />
      <circle cx="7.5" cy="6.5" r="0.9" fill={filled ? "white" : "currentColor"} />
      <path d="M7 18h9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

