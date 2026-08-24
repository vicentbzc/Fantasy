"use client";

import { useState } from "react";
import type { Partido } from "@/lib/db";
import { TarjetaProximoPartido } from "./TarjetaProximoPartido";
import { ModalPartido } from "./ModalPartido";

export function ListaProximosPartidos({
  partidos,
  equipoId,
  equipoNombre,
}: {
  partidos: Partido[];
  equipoId: number;
  equipoNombre: string;
}) {
  const [ordenAbierto, setOrdenAbierto] = useState<number | null>(null);

  return (
    <>
      {partidos.map((partido) => (
        <div
          key={partido.orden}
          role="button"
          tabIndex={0}
          onClick={() => setOrdenAbierto(partido.orden)}
          className="cursor-pointer"
        >
          <TarjetaProximoPartido partido={partido} equipoId={equipoId} equipoNombre={equipoNombre} />
        </div>
      ))}

      {ordenAbierto !== null && (
        <ModalPartido equipoId={equipoId} orden={ordenAbierto} onClose={() => setOrdenAbierto(null)} />
      )}
    </>
  );
}
