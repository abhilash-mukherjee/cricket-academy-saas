"use client";

import { useRef, useState } from "react";

type BrochureCarouselProps = {
  images: { url: string }[];
};

export function BrochureCarousel({ images }: BrochureCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function goTo(nextIndex: number) {
    const scroller = scrollerRef.current;
    if (!scroller || images.length === 0) {
      return;
    }

    const wrapped =
      (nextIndex + images.length) % images.length;
    setIndex(wrapped);
    scroller.scrollTo({
      left: wrapped * scroller.clientWidth,
      behavior: "smooth",
    });
  }

  function syncIndexFromScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) {
      return;
    }

    const next = Math.round(scroller.scrollLeft / scroller.clientWidth);
    setIndex(Math.min(images.length - 1, Math.max(0, next)));
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Photos">
      <div className="relative">
        <div
          ref={scrollerRef}
          className="carousel w-full rounded-box"
          onScroll={syncIndexFromScroll}
        >
          {images.map((image) => (
            <div key={image.url} className="carousel-item w-full">
              <img
                src={image.url}
                alt=""
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-circle absolute top-1/2 left-5 z-10 -translate-y-1/2"
          aria-label="Previous"
          onClick={() => goTo(index - 1)}
        >
          ❮
        </button>
        <button
          type="button"
          className="btn btn-circle absolute top-1/2 right-5 z-10 -translate-y-1/2"
          aria-label="Next"
          onClick={() => goTo(index + 1)}
        >
          ❯
        </button>
      </div>
      <div className="flex w-full justify-center gap-2 py-2">
        {images.map((image, slideIndex) => (
          <button
            key={image.url}
            type="button"
            className={
              slideIndex === index
                ? "bg-base-content size-2 rounded-full"
                : "bg-base-content/40 hover:bg-base-content size-2 rounded-full"
            }
            aria-label={`Photo ${slideIndex + 1}`}
            aria-current={slideIndex === index ? "true" : undefined}
            onClick={() => goTo(slideIndex)}
          />
        ))}
      </div>
    </section>
  );
}
