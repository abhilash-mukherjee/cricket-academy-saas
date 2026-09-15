"use client";

import Image from "next/image";
import { useState } from "react";

type BrochureYoutubeProps = {
  videoId: string;
};

export function BrochureYoutube({ videoId }: BrochureYoutubeProps) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
        title="YouTube video"
        className="aspect-video w-full rounded-box"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }

  return (
    <button
      type="button"
      className="relative aspect-video w-full overflow-hidden rounded-box"
      aria-label="Play YouTube video"
      onClick={() => setPlaying(true)}
    >
      <Image
        src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        fill
        sizes="(min-width: 1024px) 32rem, 100vw"
        className="object-cover"
      />
      <span
        aria-hidden
        className="bg-base-content/70 absolute inset-0 flex items-center justify-center"
      >
        <span className="bg-base-100 text-base-content flex size-16 items-center justify-center rounded-full text-2xl">
          ▶
        </span>
      </span>
    </button>
  );
}
