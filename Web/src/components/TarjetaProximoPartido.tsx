"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ImagenCuadrada } from "./ImagenCuadrada";
import { urlEscudoEquipo, urlLogoCompeticion } from "@/lib/imagenes";
import { formatearCuando, COLOR_DIFICULTAD } from "@/lib/formato";
import type { Partido } from "@/lib/db";

function ConEnlaceAEquipo({
  id,
  className,
  children,
}: {
  id: number | null;
  className?: string;
  children: ReactNode;
}) {
  if (id === null) return <span className={className}>{children}</span>;
  return (
    <Link href={`/equipos/${id}`} onClick={(e) => e.stopPropagation()} className={`hover:opacity-70 ${className ?? ""}`}>
      {children}
    </Link>
  );
}

export function TarjetaProximoPartido({
  partido,
  equipoId,
  equipoNombre,
}: {
  partido: Partido;
  equipoId: number;
  equipoNombre: string;
}) {
  const cuando = formatearCuando(partido.jornada, partido.dia, partido.hora, partido.localVisitante);
  const logoCompeticion = urlLogoCompeticion(partido.competicion);
  const colorDificultad = partido.dificultad ? COLOR_DIFICULTAD[partido.dificultad] : null;

  const nombreRival = partido.rivalNombreOficial ?? partido.rival ?? "Por confirmar";
  const esVisitante = partido.localVisitante === "Visitante";
  const local = esVisitante ? { id: partido.rivalId, nombre: nombreRival } : { id: equipoId, nombre: equipoNombre };
  const visitante = esVisitante ? { id: equipoId, nombre: equipoNombre } : { id: partido.rivalId, nombre: nombreRival };

  return (
    <div className="rounded-[18px] bg-[#F5F5F7] p-[18px] flex flex-col items-center gap-[10px] text-center w-full">
      <p className="text-xs font-medium text-[#6E6E73]">{cuando || "Por confirmar"}</p>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 w-full">
        <ConEnlaceAEquipo id={local.id} className="text-xs font-semibold text-[#1D1D1F] text-right">
          {local.nombre}
        </ConEnlaceAEquipo>
        <div className="flex items-center gap-2">
          <ConEnlaceAEquipo id={local.id}>
            <ImagenCuadrada src={urlEscudoEquipo(local.id)} alt={local.nombre} size={64} radius={12} bg="transparent" padding={10} />
          </ConEnlaceAEquipo>
          <span className="text-xs font-bold text-[#6E6E73]">VS</span>
          <ConEnlaceAEquipo id={visitante.id}>
            <ImagenCuadrada
              src={urlEscudoEquipo(visitante.id)}
              alt={visitante.nombre}
              size={64}
              radius={12}
              bg="transparent"
              padding={10}
            />
          </ConEnlaceAEquipo>
        </div>
        <ConEnlaceAEquipo id={visitante.id} className="text-xs font-semibold text-[#1D1D1F] text-left">
          {visitante.nombre}
        </ConEnlaceAEquipo>
      </div>

      {logoCompeticion && (
        <ImagenCuadrada src={logoCompeticion} alt={partido.competicion ?? ""} size={22} radius={8} bg="transparent" />
      )}

      {colorDificultad && (
        <p className="text-xs font-semibold" style={{ color: colorDificultad }}>
          Dificultad {partido.dificultad!.toLowerCase()}
        </p>
      )}
    </div>
  );
}
