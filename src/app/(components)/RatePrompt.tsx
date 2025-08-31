"use client";
import { useState } from "react";
import { Toilet } from "@/app/(lib)/toilets";
import { ToiletIcon } from "@/app/(icons)/ToiletIcon";
import { addReview } from "@/app/(lib)/toilets";

type Props = {
  toilet: Toilet;
  visible: boolean;
  onSubmitted?: () => void;
};

export function RatePrompt({ toilet, visible, onSubmitted }: Props) {
  const [rating, setRating] = useState<number>(0);
  const [text, setText] = useState("");
  if (!visible) return null;
  return (
    <div className="mt-3 p-3 border border-zinc-200 rounded-2xl">
      <div className="text-sm mb-2">Var dette toalettet bra?</div>
      <div className="flex items-center gap-2">
        {new Array(5).fill(0).map((_, i) => (
          <button
            key={i}
            onClick={() => setRating(i + 1)}
            className="active:scale-95"
          >
            <ToiletIcon size={24} filled={i < rating} className="text-black" />
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Kort vurdering (valgfritt)"
        rows={3}
        className="mt-2 w-full text-sm p-2 border border-zinc-200 rounded-xl outline-none"
      />
      <button
        onClick={() => { if (rating>0) { addReview(toilet.id, rating, text.trim() || undefined); onSubmitted?.(); } }}
        disabled={rating === 0}
        className="mt-2 w-full rounded-2xl bg-black text-white px-4 py-2 disabled:opacity-50"
      >
        Send
      </button>
    </div>
  );
}

