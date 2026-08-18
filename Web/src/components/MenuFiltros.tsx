"use client";

import { useEffect, useRef, useState } from "react";
import type { Jugador } from "@/lib/db";
import { COLUMNAS_NUMERICAS, OPCIONES_ACELERACION, type Operador } from "@/lib/columnas";

export type FiltroNumericoActivo = { operador: Operador; valor: number };
export type FiltrosNumericos = Partial<Record<keyof Jugador, FiltroNumericoActivo>>;

export function MenuFiltros({
  filtros,
  onChangeFiltros,
  aceleracion,
  onChangeAceleracion,
}: {
  filtros: FiltrosNumericos;
  onChangeFiltros: (nuevo: FiltrosNumericos) => void;
  aceleracion: string[];
  onChangeAceleracion: (nuevo: string[]) => void;
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

  const numActivos = Object.keys(filtros).length + (aceleracion.length > 0 ? 1 : 0);

  function activar(clave: keyof Jugador, activo: boolean) {
    const nuevo = { ...filtros };
    if (activo) {
      nuevo[clave] = filtros[clave] ?? { operador: ">", valor: 0 };
    } else {
      delete nuevo[clave];
    }
    onChangeFiltros(nuevo);
  }

  function cambiarOperador(clave: keyof Jugador, operador: Operador) {
    const actual = filtros[clave];
    if (!actual) return;
    onChangeFiltros({ ...filtros, [clave]: { ...actual, operador } });
  }

  function cambiarValor(clave: keyof Jugador, valor: number) {
    const actual = filtros[clave];
    if (!actual) return;
    onChangeFiltros({ ...filtros, [clave]: { ...actual, valor } });
  }

  function alternarAceleracion(opcion: string) {
    if (aceleracion.includes(opcion)) {
      onChangeAceleracion(aceleracion.filter((o) => o !== opcion));
    } else {
      onChangeAceleracion([...aceleracion, opcion]);
    }
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
        <div className="absolute z-40 mt-2 w-[340px] max-h-[70vh] overflow-y-auto rounded-2xl bg-white shadow-lg p-3 right-0">
          {(Object.keys(filtros).length > 0 || aceleracion.length > 0) && (
            <button
              type="button"
              onClick={() => {
                onChangeFiltros({});
                onChangeAceleracion([]);
              }}
              className="w-full text-left px-2 py-1.5 text-xs text-neutral-500 rounded-[10px] transition-colors duration-200 hover:bg-[#FAFAFC] hover:text-neutral-900"
            >
              Limpiar filtros
            </button>
          )}

          <p className="px-2 pt-2 pb-1 text-xs font-semibold text-neutral-400 uppercase">Aceleración</p>
          <div className="grid grid-cols-2 gap-x-2">
            {OPCIONES_ACELERACION.map((opcion) => (
              <label key={opcion} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={aceleracion.includes(opcion)}
                  onChange={() => alternarAceleracion(opcion)}
                  className="shrink-0"
                />
                <span className="truncate">{opcion}</span>
              </label>
            ))}
          </div>

          <p className="px-2 pt-3 pb-1 text-xs font-semibold text-neutral-400 uppercase">Estadísticas</p>
          {COLUMNAS_NUMERICAS.map((columna) => {
            const activo = filtros[columna.clave];
            return (
              <div key={columna.clave} className="flex items-center gap-2 px-2 py-1">
                <input
                  type="checkbox"
                  checked={!!activo}
                  onChange={(e) => activar(columna.clave, e.target.checked)}
                  className="shrink-0"
                />
                <span className="flex-1 text-sm truncate">{columna.etiqueta}</span>
                <select
                  value={activo?.operador ?? ">"}
                  disabled={!activo}
                  onChange={(e) => cambiarOperador(columna.clave, e.target.value as Operador)}
                  className="text-sm bg-neutral-100 rounded-md px-1 py-0.5 disabled:opacity-40"
                >
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                  <option value="=">=</option>
                </select>
                <input
                  type="number"
                  value={activo?.valor ?? 0}
                  disabled={!activo}
                  onChange={(e) => cambiarValor(columna.clave, Number(e.target.value))}
                  className="w-16 text-sm bg-neutral-100 rounded-md px-1.5 py-0.5 disabled:opacity-40"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
