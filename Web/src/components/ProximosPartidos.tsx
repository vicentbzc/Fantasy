"use client";

import { useEffect, useState } from "react";
import { accionProximosPartidos } from "@/app/actions";
import { ListaProximosPartidos } from "./ListaProximosPartidos";
import type { Partido } from "@/lib/db";

export function ProximosPartidos({
  equipoId,
  equipoNombre,
  onClose,
}: {
  equipoId: number;
  equipoNombre: string;
  onClose: () => void;
}) {
  const [datos, setDatos] = useState<{ partidos: Partido[]; jornadaLigaOrden: number | null } | null>(null);

  useEffect(() => {
    let cancelado = false;
    accionProximosPartidos(equipoId).then((resultado) => {
      if (!cancelado) setDatos(resultado);
    });
    return () => {
      cancelado = true;
    };
  }, [equipoId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Próximos partidos de {equipoNombre}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">
            ✕
          </button>
        </div>

        {datos === null && <p className="text-sm text-neutral-500">Cargando…</p>}
        {datos !== null && datos.partidos.length === 0 && (
          <p className="text-sm text-neutral-500">Sin partidos programados.</p>
        )}

        {datos !== null && datos.partidos.length > 0 && (
          <ListaProximosPartidos
            partidos={datos.partidos}
            equipoId={equipoId}
            equipoNombre={equipoNombre}
            jornadaLigaOrden={datos.jornadaLigaOrden}
          />
        )}
      </div>
    </div>
  );
}
