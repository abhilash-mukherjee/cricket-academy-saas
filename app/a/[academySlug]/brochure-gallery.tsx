"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export const HERO_CAROUSEL_INTERVAL_MS = 5000;

type MediaQueryFn = (query: string) => { matches: boolean };

/** Start the 5-second ambient hero carousel interval when 2+ slides exist and motion is allowed. */
export function startHeroCarouselTimer(
  slideCount: number,
  onAdvance: () => void,
  matchMedia: MediaQueryFn | undefined = typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia.bind(window)
    : undefined,
): () => void {
  if (slideCount < 2) {
    return () => undefined;
  }
  if (matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    return () => undefined;
  }

  const timerId = setInterval(onAdvance, HERO_CAROUSEL_INTERVAL_MS);
  return () => clearInterval(timerId);
}

type BrochureCarouselProps = {
  images: { url: string }[];
};

/** Full-bleed ambient crossfade carousel behind the hero scrim. */
export function BrochureCarousel({ images }: BrochureCarouselProps) {
  const [index, setIndex] = useState(0);
  const slideCount = images.length;
  const activeIndex = slideCount > 0 ? index % slideCount : 0;

  useEffect(() => {
    return startHeroCarouselTimer(slideCount, () =>
      setIndex((current) => (current + 1) % slideCount),
    );
  }, [slideCount]);

  return (
    <div
      data-carousel="hero"
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden"
    >
      {images.map((image, slideIndex) => (
        <div
          key={`${image.url}-${slideIndex}`}
          data-slide-active={slideIndex === activeIndex ? "true" : "false"}
          className={
            slideIndex === activeIndex
              ? "absolute inset-0 opacity-100 transition-opacity duration-1000 ease-in-out motion-reduce:transition-none"
              : "absolute inset-0 opacity-0 transition-opacity duration-1000 ease-in-out motion-reduce:transition-none"
          }
        >
          <Image
            src={image.url}
            alt=""
            fill
            sizes="100vw"
            preload={slideIndex === 0}
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}
