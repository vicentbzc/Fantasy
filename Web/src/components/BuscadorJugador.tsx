"use client";

import { useMemo, useState } from "react";
import type { Jugador } from "@/lib/db";
import { normalizarTexto } from "@/lib/texto";

export function BuscadorJugador({
  jugadores,
  excluirIds,
  onSeleccionar,
  className = "absolute z-40 mt-2 w-64 max-h-72 overflow-y-auto rounded-2xl bg-white shadow-lg p-2 left-1/2 -translate-x-1/2",
}: {
  jugadores: Jugador[];
  excluirIds: Set<number>;
  onSeleccionar: (id: number) => void;
  className?: string;
}) {
  const [busqueda, setBusqueda] = useState("");

  const candidatos = useMemo(() => {
    const texto = normalizarTexto(busqueda.trim());
    return jugadores
      .filter((j) => !excluirIds.has(j.id) && (!texto || normalizarTexto(j.nombre).includes(texto)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [jugadores, excluirIds, busqueda]);

  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar jugador"
        className="w-full bg-neutral-100 rounded-md px-2 py-1 text-sm mb-1"
        autoFocus
      />
      {candidatos.slice(0, 30).map((j) => (
        <button
          key={j.id}
          type="button"
          onClick={() => onSeleccionar(j.id)}
          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors duration-200 hover:bg-[#FAFAFC]"
        >
          <span className="truncate min-w-0">{j.nombre}</span>
          <span className="text-neutral-400 shrink-0">{j.equipoNombreOficial ?? j.equipo}</span>
        </button>
      ))}
      {candidatos.length === 0 && <p className="px-3 py-1.5 text-sm text-neutral-400">Sin resultados</p>}
    </div>
  );
}
