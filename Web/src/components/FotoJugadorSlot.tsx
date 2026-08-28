"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
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
  size: number | string;
  radius: number | string;
  bg?: string;
  probabilidad: number | null;
  colorProbabilidad: string;
  fontSizeProbabilidad: number | string;
  colorNombre?: string;
  fontSizeNombre?: number | string;
  lineas?: { texto: string; color?: string; onClick?: () => void; sufijo?: ReactNode }[];
  onClick?: () => void;
  href?: string;
}) {
  const [error, setError] = useState(false);
  const [resaltado, setResaltado] = useState(false);
  const mostrarSinFoto = !src || error;
  // `size` puede venir como cadena CSS (p. ej. "8.86cqw") para que el campo
  // escale; next/image necesita un intrínseco numérico y el tamaño real lo
  // controla `w-full h-full`.
  const dimImagen = typeof size === "number" ? size : 128;
  const esClicable = Boolean(onClick || href);
  const claseContenedor = `flex flex-col items-center gap-1 ${esClicable ? "cursor-pointer" : ""}`;
  const eventosHover = esClicable
    ? { onMouseEnter: () => setResaltado(true), onMouseLeave: () => setResaltado(false) }
    : {};

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
              {linea.sufijo}
            </span>
          ))}
        </div>
      ) : (
        <span
          style={{ color: colorProbabilidad, fontSize: fontSizeProbabilidad }}
          className="font-bold leading-none whitespace-nowrap"
        >
          {probabilidad === null ? "—" : `${probabilidad} %`}
        </span>
      )}
      <div style={{ opacity: resaltado ? 0.85 : 1 }} className="flex flex-col items-center gap-1 transition-opacity duration-200">
        <div
          style={{ width: size, height: size, borderRadius: radius }}
          className="overflow-hidden shrink-0"
        >
          <Image
            src={mostrarSinFoto ? SIN_FOTO : src!}
            alt={alt}
            width={dimImagen}
            height={dimImagen}
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
    </>
  );

  if (href) {
    return (
      <Link href={href} className={claseContenedor} style={{ width: size }} {...eventosHover}>
        {contenido}
      </Link>
    );
  }

  return (
    <div className={claseContenedor} style={{ width: size }} onClick={onClick} {...eventosHover}>
      {contenido}
    </div>
  );
}
