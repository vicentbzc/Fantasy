"use client";

import { useEffect, useRef, useState } from "react";

export function MenuMultiSeleccion({
  etiqueta,
  opciones,
  seleccionados,
  onChange,
}: {
  etiqueta: string;
  opciones: string[];
  seleccionados: string[];
  onChange: (nuevos: string[]) => void;
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

  function alternar(opcion: string) {
    if (seleccionados.includes(opcion)) {
      onChange(seleccionados.filter((o) => o !== opcion));
    } else {
      onChange([...seleccionados, opcion]);
    }
  }

  const etiquetaBoton = seleccionados.length === 0 ? etiqueta : `${etiqueta} (${seleccionados.length})`;

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className={`h-12 w-[180px] bg-white rounded-[14px] px-4 text-sm flex items-center justify-between gap-2 transition-colors duration-200 hover:bg-[#FAFAFC] ${
          seleccionados.length > 0 ? "text-neutral-900 font-medium" : "text-neutral-500"
        }`}
      >
        {etiquetaBoton}
        <span className="text-neutral-400 text-xs">▾</span>
      </button>

      {abierto && (
        <div className="absolute z-40 mt-2 w-56 max-h-72 overflow-y-auto rounded-2xl bg-white shadow-lg p-2">
          {seleccionados.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-500 rounded-lg transition-colors duration-200 hover:bg-[#FAFAFC] hover:text-neutral-900"
            >
              Limpiar selección
            </button>
          )}
          {opciones.map((opcion) => (
            <label
              key={opcion}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors duration-200 hover:bg-[#FAFAFC] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={seleccionados.includes(opcion)}
                onChange={() => alternar(opcion)}
                className="shrink-0"
              />
              <span className="truncate">{opcion}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
