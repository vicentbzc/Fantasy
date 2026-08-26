"use client";

import { useEffect, useState } from "react";
import { accionHistorialValor } from "@/app/actions";
import type { Jugador, PuntoHistorialValor } from "@/lib/db";
import { formatearValor } from "@/lib/formato";

export function GraficaValor({ jugador, onClose }: { jugador: Jugador; onClose: () => void }) {
  const [datos, setDatos] = useState<PuntoHistorialValor[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    accionHistorialValor(jugador.id).then((resultado) => {
      if (!cancelado) setDatos(resultado);
    });
    return () => {
      cancelado = true;
    };
  }, [jugador.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Histórico del valor de {jugador.nombre}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">
            ✕
          </button>
        </div>

        {datos === null && <p className="text-sm text-neutral-500">Cargando…</p>}
        {datos !== null && datos.length === 0 && <p className="text-sm text-neutral-500">Sin histórico todavía.</p>}
        {datos !== null && datos.length > 0 && <GraficaLinea datos={datos} />}
      </div>
    </div>
  );
}

function formatearFechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split("-");
  return `${dia}/${mes}`;
}

function GraficaLinea({ datos }: { datos: PuntoHistorialValor[] }) {
  const ancho = 460;
  const alto = 180;
  const padding = 28;
  const valores = datos.map((d) => d.valor);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;

  const puntos = datos.map((dato, i) => {
    const x = padding + (i / Math.max(datos.length - 1, 1)) * (ancho - padding * 2);
    const y = padding + (1 - (dato.valor - min) / rango) * (alto - padding * 2);
    return { x, y, dato };
  });

  const linea = puntos.map((p) => `${p.x},${p.y}`).join(" ");

  const MAXIMO_ETIQUETAS = 6;
  const paso = Math.max(1, Math.ceil((puntos.length - 1) / (MAXIMO_ETIQUETAS - 1)));
  const indicesEtiquetas = new Set<number>();
  for (let i = 0; i < puntos.length; i += paso) indicesEtiquetas.add(i);
  indicesEtiquetas.add(puntos.length - 1);

  return (
    <div>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full h-auto">
        <polyline points={linea} fill="none" stroke="#FE645F" strokeWidth={2} />
        {puntos.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#FE645F" />
        ))}
      </svg>
      <div className="relative h-3 text-[9px] text-neutral-500 mt-1">
        {puntos
          .filter((_, i) => indicesEtiquetas.has(i))
          .map((p, i) => (
            <span key={i} className="absolute -translate-x-1/2" style={{ left: `${(p.x / ancho) * 100}%` }}>
              {formatearFechaCorta(p.dato.fecha)}
            </span>
          ))}
      </div>
      <div className="flex justify-between text-sm mt-2">
        <span className="text-neutral-500">Mínimo: {formatearValor(min)}</span>
        <span className="text-neutral-500">Máximo: {formatearValor(max)}</span>
      </div>
      <RevalorizacionDiaria datos={datos} />
    </div>
  );
}

function formatearFechaLarga(fecha: string): string {
  const [, mes, dia] = fecha.split("-");
  return `${dia}/${mes}`;
}

function RevalorizacionDiaria({ datos }: { datos: PuntoHistorialValor[] }) {
  const filas = datos
    .slice(1)
    .map((dato, i) => ({
      fecha: dato.fecha,
      diferencia: dato.valor - datos[i].valor,
    }))
    .reverse();

  if (filas.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium mb-2">Revalorización por día</h4>
      <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto text-sm">
        {filas.map((fila) => (
          <li key={fila.fecha} className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">{formatearFechaLarga(fila.fecha)}</span>
            <span
              className="tabular-nums"
              style={{ color: fila.diferencia > 0 ? "#3BB568" : fila.diferencia < 0 ? "#FE645F" : undefined }}
            >
              {fila.diferencia > 0 ? "+" : ""}
              {formatearValor(fila.diferencia)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
