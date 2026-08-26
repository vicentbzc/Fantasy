"use client";

import { useState } from "react";
import type { Partido } from "@/lib/db";
import { TarjetaProximoPartido } from "./TarjetaProximoPartido";
import { ModalPartido } from "./ModalPartido";

export function ListaProximosPartidos({
  partidos,
  equipoId,
  equipoNombre,
  fondoTarjeta,
}: {
  partidos: Partido[];
  equipoId: number;
  equipoNombre: string;
  fondoTarjeta?: string;
}) {
  const [ordenAbierto, setOrdenAbierto] = useState<number | null>(null);
  const [ordenResaltado, setOrdenResaltado] = useState<number | null>(null);

  return (
    <div className="w-full flex flex-col gap-[18px]">
      {partidos.map((partido) => (
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
            fondo={fondoTarjeta}
          />
        </div>
      ))}

      {ordenAbierto !== null && (
        <ModalPartido equipoId={equipoId} orden={ordenAbierto} onClose={() => setOrdenAbierto(null)} />
      )}
    </div>
  );
}
