"use client";

import Image from "next/image";
import { useState } from "react";

export function Avatar({ src, alt, size }: { src: string; alt: string; size: number }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-full bg-neutral-800 flex items-center justify-center text-neutral-500 text-[10px] shrink-0"
      >
        {alt.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="rounded-full object-cover bg-neutral-800 shrink-0"
      onError={() => setError(true)}
    />
  );
}
