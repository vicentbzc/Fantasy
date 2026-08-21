"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { Jugador } from "@/lib/db";
import { MenuFiltros, type ColumnasVisibles } from "./MenuFiltros";
import { urlFotoJugador } from "@/lib/imagenes";
import { formatearEstado, COLOR_DIFICULTAD } from "@/lib/formato";
import { COLUMNAS_OPCIONALES, formatearNumero } from "@/lib/columnas";

export function Comparador({ jugadores }: { jugadores: Jugador[] }) {
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [columnasVisibles, setColumnasVisibles] = useState<ColumnasVisibles>({});
  const [abiertoAnadir, setAbiertoAnadir] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const jugadoresSeleccionados = seleccionados
    .map((id) => jugadores.find((j) => j.id === id))
    .filter((j): j is Jugador => j !== undefined);

  const candidatos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return jugadores.filter((j) => !seleccionados.includes(j.id) && (!texto || j.nombre.toLowerCase().includes(texto)));
  }, [jugadores, seleccionados, busqueda]);

  function quitar(id: number) {
    setSeleccionados((actual) => actual.filter((x) => x !== id));
  }

  function anadir(id: number) {
    setSeleccionados((actual) => (actual.length >= 3 ? actual : [...actual, id]));
    setAbiertoAnadir(false);
    setBusqueda("");
  }

  const columnas = COLUMNAS_OPCIONALES.filter(
    (columna) => columna.clave !== "aceleracion" && columnasVisibles[columna.clave]
  );

  function colorMejorPeor(valores: (number | null)[], i: number): string | undefined {
    const validos = valores.filter((v): v is number => v !== null);
    if (validos.length < 2) return undefined;
    const max = Math.max(...validos);
    const min = Math.min(...validos);
    if (max === min) return undefined;
    const v = valores[i];
    if (v === null) return undefined;
    if (v === max) return "#16A34A";
    if (v === min) return "#DC2626";
    return undefined;
  }

  return (
    <div className="flex flex-col gap-6 px-6 pb-16 max-w-[1104px] mx-auto w-full pt-8">
      <div className="grid grid-cols-3 gap-4 max-w-[644px] mx-auto w-full">
        {jugadoresSeleccionados.map((j) => (
          <div key={j.id} className="relative bg-white rounded-[24px] p-5 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => quitar(j.id)}
              className="absolute top-3 left-3 text-neutral-400 hover:text-neutral-700"
            >
              −
            </button>
            <div className="w-full aspect-square rounded-[18px] overflow-hidden">
              <Image
                src={urlFotoJugador(j.id)}
                alt={j.nombre}
                width={160}
                height={160}
                className="object-cover w-full h-full"
              />
            </div>
            <p className="font-bold text-center">{j.nombre}</p>
          </div>
        ))}

        {seleccionados.length < 3 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setAbiertoAnadir((a) => !a)}
              className="w-full aspect-square bg-white rounded-[24px] flex flex-col items-center justify-center gap-2 transition-colors duration-200 hover:bg-[#FAFAFC]"
            >
              <span className="text-2xl text-neutral-500 leading-none">+</span>
              <span className="font-medium text-neutral-700">Añadir jugador</span>
            </button>

            {abiertoAnadir && (
              <div className="absolute z-40 mt-2 w-64 max-h-72 overflow-y-auto rounded-2xl bg-white shadow-lg p-2 left-1/2 -translate-x-1/2">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar jugador"
                  className="w-full bg-neutral-100 rounded-md px-2 py-1 text-sm mb-1"
                  autoFocus
                />
                {candidatos.slice(0, 30).map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => anadir(j.id)}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors duration-200 hover:bg-[#FAFAFC]"
                  >
                    {j.nombre} <span className="text-neutral-400">· {j.equipoNombreOficial ?? j.equipo}</span>
                  </button>
                ))}
                {candidatos.length === 0 && <p className="px-3 py-1.5 text-sm text-neutral-400">Sin resultados</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {jugadoresSeleccionados.length >= 2 ? (
        <div className="overflow-x-auto rounded-[18px] bg-white">
          <table className="text-sm border-separate border-spacing-0 w-full">
            <thead>
              <tr>
                <th className="p-3 text-left w-[140px]">
                  <MenuFiltros
                    columnas={columnasVisibles}
                    onChangeColumnas={setColumnasVisibles}
                    excluir={["aceleracion"]}
                  />
                </th>
                {jugadoresSeleccionados.map((j) => (
                  <th key={j.id} className="p-3 text-center text-neutral-500 font-semibold whitespace-nowrap">
                    {j.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  { etiqueta: "Equipo", valor: (j: Jugador) => j.equipoNombreOficial ?? j.equipo },
                  { etiqueta: "Posición", valor: (j: Jugador) => j.posicion },
                  { etiqueta: "Estado", valor: (j: Jugador) => formatearEstado(j.estado) },
                  { etiqueta: "Aceleración", valor: (j: Jugador) => j.aceleracion ?? "—" },
                  {
                    etiqueta: "Próxima dificultad",
                    valor: (j: Jugador) => j.proximaDificultad ?? "—",
                    color: (j: Jugador) => (j.proximaDificultad ? COLOR_DIFICULTAD[j.proximaDificultad] : undefined),
                  },
                ] as { etiqueta: string; valor: (j: Jugador) => string; color?: (j: Jugador) => string | undefined }[]
              ).map((fila, i) => (
                <tr key={fila.etiqueta} style={{ backgroundColor: i % 2 === 0 ? "rgba(29,29,31,0.04)" : "#FFFFFF" }}>
                  <td className="p-3 text-neutral-500 whitespace-nowrap">{fila.etiqueta}</td>
                  {jugadoresSeleccionados.map((j) => (
                    <td
                      key={j.id}
                      className="p-3 text-center whitespace-nowrap"
                      style={{ color: fila.color?.(j) }}
                    >
                      {fila.valor(j)}
                    </td>
                  ))}
                </tr>
              ))}

              {columnas.map((columna, i) => {
                const valores = jugadoresSeleccionados.map((j) => j[columna.clave] as number | null);
                return (
                  <tr
                    key={columna.clave}
                    style={{ backgroundColor: (i + 5) % 2 === 0 ? "rgba(29,29,31,0.04)" : "#FFFFFF" }}
                  >
                    <td className="p-3 text-neutral-500 whitespace-nowrap">{columna.etiqueta}</td>
                    {jugadoresSeleccionados.map((j, idx) => (
                      <td
                        key={j.id}
                        className="p-3 text-center tabular-nums whitespace-nowrap"
                        style={{ color: colorMejorPeor(valores, idx) }}
                      >
                        {formatearNumero(j[columna.clave] as number | null, columna.decimales ?? 0)}
                        {columna.sufijo ?? ""}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-400 text-center">Añade al menos 2 jugadores para compararlos.</p>
      )}
    </div>
  );
}
