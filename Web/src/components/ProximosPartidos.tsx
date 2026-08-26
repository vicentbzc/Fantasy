"use client";

import { useEffect, useState } from "react";
import { accionProximosPartidos } from "@/app/actions";
import { TarjetaProximoPartido } from "./TarjetaProximoPartido";
import { ModalPartido } from "./ModalPartido";
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
  const [partidos, setPartidos] = useState<Partido[] | null>(null);
  const [ordenAbierto, setOrdenAbierto] = useState<number | null>(null);
  const [ordenResaltado, setOrdenResaltado] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    accionProximosPartidos(equipoId).then((resultado) => {
      if (!cancelado) setPartidos(resultado);
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

        {partidos === null && <p className="text-sm text-neutral-500">Cargando…</p>}
        {partidos !== null && partidos.length === 0 && (
          <p className="text-sm text-neutral-500">Sin partidos programados.</p>
        )}

        <div className="flex flex-col gap-3">
          {partidos?.map((partido) => (
            <div
              key={partido.orden}
              role="button"
              tabIndex={0}
              onClick={() => setOrdenAbierto(partido.orden)}
              onMouseEnter={() => setOrdenResaltado(partido.orden)}
              onMouseLeave={() => setOrdenResaltado(null)}
              className="cursor-pointer"
            >
              <TarjetaProximoPartido
                partido={partido}
                equipoId={equipoId}
                equipoNombre={equipoNombre}
                resaltada={ordenResaltado === partido.orden}
              />
            </div>
          ))}
        </div>
      </div>

      {ordenAbierto !== null && (
        <ModalPartido equipoId={equipoId} orden={ordenAbierto} onClose={() => setOrdenAbierto(null)} />
      )}
    </div>
  );
}
