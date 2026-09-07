"use client";

import type { CSSProperties } from "react";

type Star = {
  top: number;
  left: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  spark: boolean;
};

// Seeded PRNG (mulberry32) so the server and client render identical stars.
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateStars(): Star[] {
  const random = createRandom(20260906);
  const stars: Star[] = [];
  for (let i = 0; i < 90; i += 1) {
    stars.push({
      top: random() * 100,
      left: random() * 100,
      size: 1 + random() * 1.6,
      opacity: 0.15 + random() * 0.5,
      duration: 2.5 + random() * 4.5,
      delay: random() * 5,
      spark: false,
    });
  }
  for (let i = 0; i < 9; i += 1) {
    stars.push({
      top: random() * 100,
      left: random() * 100,
      size: 5 + random() * 5,
      opacity: 0.3 + random() * 0.45,
      duration: 3 + random() * 4,
      delay: random() * 5,
      spark: true,
    });
  }
  return stars;
}

const stars = generateStars();

/** Fixed twinkling-stars backdrop behind the whole app. */
export function StarfieldBackdrop() {
  return (
    <div className="starfield" aria-hidden="true">
      {stars.map((star, index) => (
        <span
          key={index}
          className={`${star.spark ? "spark" : "star"} twinkle`}
          style={
            {
              top: `${star.top}%`,
              left: `${star.left}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              "--star-o": star.opacity,
              animationDuration: `${star.duration}s`,
              animationDelay: `${star.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
