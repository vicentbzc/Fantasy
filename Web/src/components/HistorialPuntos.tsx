"use client";

import { useEffect, useState } from "react";
import { accionHistorialPuntos } from "@/app/actions";
import type { Jugador, JornadaPuntos, DetalleEstadistica } from "@/lib/db";

function formatearLineaDesglose(linea: DetalleEstadistica): string {
  if (linea.estadistica === "Puntos DAZN") return linea.estadistica;
  return `${linea.cantidad} ${linea.estadistica}`;
}

function formatearPuntos(puntos: number): string {
  return `${puntos} ${Math.abs(puntos) === 1 ? "punto" : "puntos"}`;
}

function Desglose({ desglose }: { desglose: DetalleEstadistica[] }) {
  return (
    <ul className="mt-2 text-xs text-neutral-500 flex flex-col gap-1">
      {desglose.map((linea, i) => (
        <li key={i} className="flex items-center justify-between gap-2">
          <span>{formatearLineaDesglose(linea)}</span>
          <span className="tabular-nums shrink-0">{formatearPuntos(linea.puntos)}</span>
        </li>
      ))}
    </ul>
  );
}

export function HistorialPuntos({
  jugador,
  onClose,
  soloUltimaJornada = false,
}: {
  jugador: Jugador;
  onClose: () => void;
  soloUltimaJornada?: boolean;
}) {
  const [datos, setDatos] = useState<JornadaPuntos[] | null>(null);
  const [expandida, setExpandida] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    accionHistorialPuntos(jugador.id).then((resultado) => {
      if (!cancelado) setDatos(resultado);
    });
    return () => {
      cancelado = true;
    };
  }, [jugador.id]);

  const datosMostrados = soloUltimaJornada ? (datos ? datos.slice(0, 1) : datos) : datos;
  const titulo = soloUltimaJornada
    ? `Puntos en la última jornada de ${jugador.nombre}`
    : `Puntos por jornada de ${jugador.nombre}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-[#F5F5F7] rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{titulo}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">
            ✕
          </button>
        </div>

        {datosMostrados === null && <p className="text-sm text-neutral-500">Cargando…</p>}
        {datosMostrados !== null && datosMostrados.length === 0 && (
          <p className="text-sm text-neutral-500">Sin jornadas jugadas todavía.</p>
        )}

        <div className="flex flex-col gap-3">
          {soloUltimaJornada
            ? datosMostrados?.map((jornada) => (
                <div key={jornada.jornada} className="rounded-xl bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">Jornada {jornada.jornada}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatearPuntos(jornada.puntos)}</span>
                  </div>
                  {jornada.desglose.length > 0 && <Desglose desglose={jornada.desglose} />}
                </div>
              ))
            : datosMostrados?.map((jornada) => {
                const abierta = expandida === jornada.jornada;
                return (
                  <div key={jornada.jornada} className="rounded-xl bg-white p-3">
                    <button
                      type="button"
                      onClick={() => setExpandida(abierta ? null : jornada.jornada)}
                      className="flex items-center justify-between w-full text-left"
                      disabled={jornada.desglose.length === 0}
                    >
                      <span className="font-medium text-sm">Jornada {jornada.jornada}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums">{formatearPuntos(jornada.puntos)}</span>
                        {jornada.desglose.length > 0 && (
                          <span className="text-neutral-400 text-xs">{abierta ? "▾" : "▸"}</span>
                        )}
                      </span>
                    </button>
                    {abierta && jornada.desglose.length > 0 && <Desglose desglose={jornada.desglose} />}
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
