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
          <h3 className="font-semibold">Histórico de valor · {jugador.nombre}</h3>
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

  return (
    <div>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full h-auto">
        <polyline points={linea} fill="none" stroke="#e83d50" strokeWidth={2} />
        {puntos.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#e83d50" />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-neutral-500 mt-1">
        <span>{datos[0].fecha}</span>
        <span>{datos[datos.length - 1].fecha}</span>
      </div>
      <div className="flex justify-between text-sm mt-2">
        <span className="text-neutral-500">Mínimo: {formatearValor(min)}</span>
        <span className="text-neutral-500">Máximo: {formatearValor(max)}</span>
      </div>
    </div>
  );
}
