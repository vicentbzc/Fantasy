"use client";

import Image from "next/image";
import { useState } from "react";
import { SIN_FOTO } from "@/lib/imagenes";

export function FotoJugadorSlot({
  src,
  alt,
  size,
  radius,
  probabilidad,
  colorProbabilidad,
  fontSizeProbabilidad,
  colorNombre = "#1D1D1F",
  fontSizeNombre = 11,
}: {
  src: string | null;
  alt: string;
  size: number;
  radius: number;
  bg?: string;
  probabilidad: number | null;
  colorProbabilidad: string;
  fontSizeProbabilidad: number;
  colorNombre?: string;
  fontSizeNombre?: number;
}) {
  const [error, setError] = useState(false);
  const mostrarSinFoto = !src || error;

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size }}>
      <span
        style={{ color: colorProbabilidad, fontSize: fontSizeProbabilidad }}
        className="font-bold leading-none whitespace-nowrap"
      >
        {probabilidad === null ? "—" : `${probabilidad}%`}
      </span>
      <div
        style={{ width: size, height: size, borderRadius: radius }}
        className="overflow-hidden shrink-0"
      >
        <Image
          src={mostrarSinFoto ? SIN_FOTO : src!}
          alt={alt}
          width={size}
          height={size}
          className="object-cover w-full h-full"
          onError={() => setError(true)}
        />
      </div>
      <span
        style={{ color: colorNombre, fontSize: fontSizeNombre }}
        className="font-medium leading-tight text-center w-full"
      >
        {alt}
      </span>
    </div>
  );
}
