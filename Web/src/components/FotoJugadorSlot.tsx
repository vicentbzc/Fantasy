"use client";

import Image from "next/image";
import Link from "next/link";
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
  lineas,
  onClick,
  href,
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
  lineas?: { texto: string; color?: string; onClick?: () => void }[];
  onClick?: () => void;
  href?: string;
}) {
  const [error, setError] = useState(false);
  const mostrarSinFoto = !src || error;
  const claseContenedor = `flex flex-col items-center gap-1 ${onClick || href ? "cursor-pointer" : ""}`;

  const contenido = (
    <>
      {lineas ? (
        <div className="flex flex-col items-center leading-none">
          {lineas.map((linea, i) => (
            <span
              key={i}
              style={{ color: linea.color ?? colorProbabilidad, fontSize: fontSizeProbabilidad }}
              className={`font-bold leading-tight whitespace-nowrap ${
                linea.onClick ? "underline decoration-dotted cursor-pointer" : ""
              }`}
              onClick={
                linea.onClick
                  ? (e) => {
                      e.stopPropagation();
                      linea.onClick!();
                    }
                  : undefined
              }
            >
              {linea.texto}
            </span>
          ))}
        </div>
      ) : (
        <span
          style={{ color: colorProbabilidad, fontSize: fontSizeProbabilidad }}
          className="font-bold leading-none whitespace-nowrap"
        >
          {probabilidad === null ? "—" : `${probabilidad}%`}
        </span>
      )}
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
    </>
  );

  if (href) {
    return (
      <Link href={href} className={claseContenedor} style={{ width: size }}>
        {contenido}
      </Link>
    );
  }

  return (
    <div className={claseContenedor} style={{ width: size }} onClick={onClick}>
      {contenido}
    </div>
  );
}
