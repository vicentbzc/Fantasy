"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Jugador } from "@/lib/db";
import { COLUMNAS_OPCIONALES } from "@/lib/columnas";

export type ColumnasVisibles = Partial<Record<keyof Jugador, true>>;

export function MenuFiltros({
  columnas,
  onChangeColumnas,
  excluir,
  claseBoton = "bg-white",
}: {
  columnas: ColumnasVisibles;
  onChangeColumnas: (nuevo: ColumnasVisibles) => void;
  excluir?: (keyof Jugador)[];
  claseBoton?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<{ top: number; right: number } | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alClicarFuera(evento: MouseEvent) {
      const objetivo = evento.target as Node;
      if (botonRef.current?.contains(objetivo)) return;
      if (panelRef.current?.contains(objetivo)) return;
      setAbierto(false);
    }
    function alHacerScroll() {
      setAbierto(false);
    }
    document.addEventListener("mousedown", alClicarFuera);
    window.addEventListener("scroll", alHacerScroll, true);
    return () => {
      document.removeEventListener("mousedown", alClicarFuera);
      window.removeEventListener("scroll", alHacerScroll, true);
    };
  }, []);

  function alternarAbierto() {
    if (!abierto && botonRef.current) {
      const rect = botonRef.current.getBoundingClientRect();
      setPosicion({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setAbierto((a) => !a);
  }

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
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={alternarAbierto}
        className={`h-12 w-[180px] ${claseBoton} rounded-[14px] px-4 text-sm flex items-center justify-between gap-2 transition-colors duration-200 hover:bg-[#FAFAFC] ${
          numActivos > 0 ? "text-neutral-900 font-medium" : "text-neutral-500"
        }`}
      >
        {numActivos === 0 ? "Filtros" : `Filtros (${numActivos})`}
        <span className="text-neutral-400 text-xs">▾</span>
      </button>

      {abierto &&
        posicion &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: posicion.top, right: posicion.right }}
            className="z-40 w-[280px] max-h-[70vh] overflow-y-auto rounded-2xl bg-white shadow-lg p-3"
          >
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
          </div>,
          document.body
        )}
    </>
  );
}
