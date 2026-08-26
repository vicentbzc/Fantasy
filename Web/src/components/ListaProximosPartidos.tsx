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
  jornadaLigaOrden,
}: {
  partidos: Partido[];
  equipoId: number;
  equipoNombre: string;
  fondoTarjeta?: string;
  jornadaLigaOrden?: number | null;
}) {
  const [ordenAbierto, setOrdenAbierto] = useState<number | null>(null);
  const [ordenResaltado, setOrdenResaltado] = useState<number | null>(null);

  return (
    <div className="w-full flex flex-col gap-[18px]">
      {partidos.slice(0, 5).map((partido) => {
        const clicable = jornadaLigaOrden === undefined || partido.orden === jornadaLigaOrden;
        return (
          <div
            key={partido.orden}
            role={clicable ? "button" : undefined}
            tabIndex={clicable ? 0 : undefined}
            onClick={clicable ? () => setOrdenAbierto(partido.orden) : undefined}
            onMouseEnter={clicable ? () => setOrdenResaltado(partido.orden) : undefined}
            onMouseLeave={clicable ? () => setOrdenResaltado(null) : undefined}
            className={clicable ? "cursor-pointer" : ""}
          >
            <TarjetaProximoPartido
              partido={partido}
              equipoId={equipoId}
              equipoNombre={equipoNombre}
              resaltada={clicable && ordenResaltado === partido.orden}
              fondo={fondoTarjeta}
            />
          </div>
        );
      })}

      {ordenAbierto !== null && (
        <ModalPartido
          equipoId={equipoId}
          orden={ordenAbierto}
          onClose={() => setOrdenAbierto(null)}
          mostrarProximosPartidos={false}
        />
      )}
    </div>
  );
}
