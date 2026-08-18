"use client";

import Image from "next/image";
import { useState } from "react";

export function ImagenCuadrada({
  src,
  alt,
  size,
  radius,
  bg = "#FFFFFF",
  padding = 0,
}: {
  src: string | null;
  alt: string;
  size: number;
  radius: number;
  bg?: string;
  padding?: number;
}) {
  const [error, setError] = useState(false);
  const mostrar = src && !error;

  return (
    <div
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, padding }}
      className="flex items-center justify-center overflow-hidden shrink-0 box-border"
    >
      {mostrar ? (
        <Image
          src={src!}
          alt={alt}
          width={size}
          height={size}
          className="object-contain w-full h-full"
          onError={() => setError(true)}
        />
      ) : (
        <span className="text-[9px] text-neutral-400 text-center px-1">{alt.slice(0, 3).toUpperCase()}</span>
      )}
    </div>
  );
}
