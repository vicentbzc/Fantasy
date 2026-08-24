"use client";

import { useState } from "react";
import Image from "next/image";
import type { Jugador } from "@/lib/db";
import { MenuFiltros, type ColumnasVisibles } from "./MenuFiltros";
import { Avatar } from "./Avatar";
import { HistorialPuntos } from "./HistorialPuntos";
import { ProximosPartidos } from "./ProximosPartidos";
import { BuscadorJugador } from "./BuscadorJugador";
import { urlFotoJugador, urlEscudoEquipo } from "@/lib/imagenes";
import { COLUMNAS_OPCIONALES, formatearCelda } from "@/lib/columnas";

const COLUMNAS_VISIBLES_DEFECTO: ColumnasVisibles = {};

const CLAVES_MENOR_ES_MEJOR = new Set<keyof Jugador>([
  "valorSinClausula",
  "valor",
  "penaltisCometidos",
  "penaltisFallados",
  "golesPropiaPuerta",
  "golesEnContra",
  "tarjetasAmarillas",
  "tarjetasRojas",
  "posesionesPerdidas",
  "dificultadProximos5",
]);

function colorMejorPeor(valores: (number | null)[], i: number, menorEsMejor: boolean): string | undefined {
  const efectivos = valores.map((v) => (v === null ? -Infinity : v));
  const max = Math.max(...efectivos);
  const min = Math.min(...efectivos);
  if (max === min) return undefined;
  const v = efectivos[i];
  const esMejor = menorEsMejor ? v === min : v === max;
  const esPeor = menorEsMejor ? v === max : v === min;
  if (esMejor) return "#16A34A";
  if (esPeor) return "#DC2626";
  return undefined;
}

export function Comparador({ jugadores }: { jugadores: Jugador[] }) {
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [columnasVisibles, setColumnasVisibles] = useState<ColumnasVisibles>(COLUMNAS_VISIBLES_DEFECTO);
  const [abiertoAnadir, setAbiertoAnadir] = useState(false);
  const [modalPuntos, setModalPuntos] = useState<{ jugador: Jugador; soloUltimaJornada: boolean } | null>(null);
  const [modalPartidos, setModalPartidos] = useState<Jugador | null>(null);

  const jugadoresSeleccionados = seleccionados
    .map((id) => jugadores.find((j) => j.id === id))
    .filter((j): j is Jugador => j !== undefined);

  function quitar(id: number) {
    setSeleccionados((actual) => actual.filter((x) => x !== id));
  }

  function anadir(id: number) {
    setSeleccionados((actual) => (actual.length >= 3 ? actual : [...actual, id]));
    setAbiertoAnadir(false);
  }

  const columnas = COLUMNAS_OPCIONALES.filter((columna) => columnasVisibles[columna.clave]);

  return (
    <div className="flex flex-col gap-6 px-6 pb-16 max-w-[1104px] mx-auto w-full pt-8">
      <div className="flex flex-wrap justify-center gap-4">
        {jugadoresSeleccionados.map((j) => (
          <div key={j.id} className="relative bg-white rounded-[24px] p-5 flex flex-col items-center gap-3 w-[255px]">
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
          <div className="relative w-[255px] h-[291px]">
            <button
              type="button"
              onClick={() => setAbiertoAnadir((a) => !a)}
              className="w-full h-full bg-white rounded-[24px] flex flex-col items-center justify-center gap-3 transition-colors duration-200 hover:bg-[#FAFAFC]"
            >
              <span className="text-3xl text-neutral-500 leading-none">+</span>
              <p className="font-bold text-center text-neutral-700">Añadir jugador</p>
            </button>

            {abiertoAnadir && (
              <BuscadorJugador jugadores={jugadores} excluirIds={new Set(seleccionados)} onSeleccionar={anadir} />
            )}
          </div>
        )}
      </div>

      {jugadoresSeleccionados.length >= 2 && (
        <div className="overflow-x-auto rounded-[18px] bg-white">
          <table className="text-sm border-separate border-spacing-0 w-full">
            <thead>
              <tr>
                <th className="p-3 text-left w-[140px] align-middle">
                  <MenuFiltros columnas={columnasVisibles} onChangeColumnas={setColumnasVisibles} claseBoton="bg-[#F5F5F7]" />
                </th>
                {jugadoresSeleccionados.map((j) => (
                  <th key={j.id} className="p-3 text-left text-neutral-500 font-semibold whitespace-nowrap align-middle">
                    {j.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columnas.map((columna, i) => {
                const esTexto = columna.tipo === "texto";
                const valoresNumericos = jugadoresSeleccionados.map((j) => j[columna.clave] as number | null);
                const valoresParaColor =
                  columna.clave === "tarjetasAmarillas"
                    ? valoresNumericos.map((v) => (v === null ? null : v % 5))
                    : valoresNumericos;
                const menorEsMejor = CLAVES_MENOR_ES_MEJOR.has(columna.clave);

                return (
                  <tr key={columna.clave} style={{ backgroundColor: i % 2 === 0 ? "rgba(29,29,31,0.04)" : "#FFFFFF" }}>
                    <td className="p-3 text-neutral-500 whitespace-nowrap">{columna.etiqueta}</td>
                    {jugadoresSeleccionados.map((j, idx) => {
                      const color = esTexto ? undefined : colorMejorPeor(valoresParaColor, idx, menorEsMejor);

                      if (columna.clave === "equipo") {
                        return (
                          <td key={j.id} className="p-3 text-left whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {j.equipoId !== null && (
                                <Avatar src={urlEscudoEquipo(j.equipoId)!} alt={j.equipo} size={20} />
                              )}
                              {j.equipoNombreOficial ?? j.equipo}
                            </div>
                          </td>
                        );
                      }

                      const texto = formatearCelda(columna, j[columna.clave]);

                      if (columna.clave === "dificultadProximos5") {
                        if (j.equipoId === null) {
                          return (
                            <td key={j.id} className="p-3 text-left" style={{ color }}>
                              {texto}
                            </td>
                          );
                        }
                        return (
                          <td key={j.id} className="p-3 text-left">
                            <button
                              type="button"
                              onClick={() => setModalPartidos(j)}
                              className="underline decoration-dotted underline-offset-2 hover:opacity-70"
                              style={{ color }}
                            >
                              {texto}
                            </button>
                          </td>
                        );
                      }

                      if (columna.clave === "puntosTotales" || columna.clave === "puntosUltimaJornada") {
                        return (
                          <td key={j.id} className="p-3 text-left tabular-nums">
                            <button
                              type="button"
                              onClick={() =>
                                setModalPuntos({ jugador: j, soloUltimaJornada: columna.clave === "puntosUltimaJornada" })
                              }
                              className="underline decoration-dotted underline-offset-2 hover:opacity-70"
                              style={{ color }}
                            >
                              {texto}
                            </button>
                          </td>
                        );
                      }

                      return (
                        <td key={j.id} className="p-3 text-left tabular-nums whitespace-nowrap" style={{ color }}>
                          {texto}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalPuntos && (
        <HistorialPuntos
          jugador={modalPuntos.jugador}
          onClose={() => setModalPuntos(null)}
          soloUltimaJornada={modalPuntos.soloUltimaJornada}
        />
      )}
      {modalPartidos && modalPartidos.equipoId !== null && (
        <ProximosPartidos
          equipoId={modalPartidos.equipoId}
          equipoNombre={modalPartidos.equipoNombreOficial ?? modalPartidos.equipo}
          onClose={() => setModalPartidos(null)}
        />
      )}
    </div>
  );
}
