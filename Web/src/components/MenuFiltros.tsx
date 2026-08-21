"use client";

import { useEffect, useRef, useState } from "react";
import type { Jugador } from "@/lib/db";
import { COLUMNAS_OPCIONALES } from "@/lib/columnas";

export type ColumnasVisibles = Partial<Record<keyof Jugador, true>>;

export function MenuFiltros({
  columnas,
  onChangeColumnas,
  excluir,
}: {
  columnas: ColumnasVisibles;
  onChangeColumnas: (nuevo: ColumnasVisibles) => void;
  excluir?: (keyof Jugador)[];
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alClicarFuera(evento: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClicarFuera);
    return () => document.removeEventListener("mousedown", alClicarFuera);
  }, []);

  const numActivos = Object.keys(columnas).length;
  const opciones = excluir ? COLUMNAS_OPCIONALES.filter((c) => !excluir.includes(c.clave)) : COLUMNAS_OPCIONALES;

  function alternar(clave: keyof Jugador) {
    const nuevo = { ...columnas };
    if (nuevo[clave]) {
      delete nuevo[clave];
    } else {
      nuevo[clave] = true;
    }
    onChangeColumnas(nuevo);
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className={`h-12 w-[180px] bg-white rounded-[14px] px-4 text-sm flex items-center justify-between gap-2 transition-colors duration-200 hover:bg-[#FAFAFC] ${
          numActivos > 0 ? "text-neutral-900 font-medium" : "text-neutral-500"
        }`}
      >
        {numActivos === 0 ? "Filtros" : `Filtros (${numActivos})`}
        <span className="text-neutral-400 text-xs">▾</span>
      </button>

      {abierto && (
        <div className="absolute z-40 mt-2 w-[280px] max-h-[70vh] overflow-y-auto rounded-2xl bg-white shadow-lg p-3 right-0">
          {numActivos > 0 && (
            <button
              type="button"
              onClick={() => onChangeColumnas({})}
              className="w-full text-left px-2 py-1.5 text-xs text-neutral-500 rounded-[10px] transition-colors duration-200 hover:bg-[#FAFAFC] hover:text-neutral-900"
            >
              Limpiar filtros
            </button>
          )}

          {opciones.map((columna) => (
            <label
              key={columna.clave}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors duration-200 hover:bg-[#FAFAFC] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={!!columnas[columna.clave]}
                onChange={() => alternar(columna.clave)}
                className="shrink-0"
              />
              <span className="truncate">{columna.etiqueta}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
