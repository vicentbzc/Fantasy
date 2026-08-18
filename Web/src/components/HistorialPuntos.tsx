"use client";

import { useEffect, useState } from "react";
import { accionHistorialPuntos } from "@/app/actions";
import type { Jugador, JornadaPuntos } from "@/lib/db";

export function HistorialPuntos({ jugador, onClose }: { jugador: Jugador; onClose: () => void }) {
  const [datos, setDatos] = useState<JornadaPuntos[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    accionHistorialPuntos(jugador.id).then((resultado) => {
      if (!cancelado) setDatos(resultado);
    });
    return () => {
      cancelado = true;
    };
  }, [jugador.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold">Puntos por jornada · {jugador.nombre}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">
            ✕
          </button>
        </div>
        <p className="text-xs text-neutral-400 mb-4">
          El rival y el resultado de cada partido todavía no se guardan en la base de datos.
        </p>

        {datos === null && <p className="text-sm text-neutral-500">Cargando…</p>}
        {datos !== null && datos.length === 0 && (
          <p className="text-sm text-neutral-500">Sin jornadas jugadas todavía.</p>
        )}

        <div className="flex flex-col gap-3">
          {datos?.map((jornada) => (
            <div key={jornada.jornada} className="rounded-xl bg-neutral-50 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Jornada {jornada.jornada}</span>
                <span className="text-sm font-semibold tabular-nums">{jornada.puntos} puntos</span>
              </div>
              {jornada.estadisticas && (
                <ul className="mt-2 text-xs text-neutral-500 list-disc list-inside">
                  {jornada.estadisticas.split(",").map((parte, i) => (
                    <li key={i}>{parte.trim()}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
