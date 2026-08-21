"use client";

import { useMemo, useState } from "react";
import type { Jugador } from "@/lib/db";
import { ORDEN_EQUIPOS } from "@/lib/equipos";
import { Avatar } from "./Avatar";
import { MenuMultiSeleccion } from "./MenuMultiSeleccion";
import { MenuFiltros, type ColumnasVisibles } from "./MenuFiltros";
import { GraficaValor } from "./GraficaValor";
import { HistorialPuntos } from "./HistorialPuntos";
import { urlFotoJugador, urlEscudoEquipo } from "@/lib/imagenes";
import { formatearEstado } from "@/lib/formato";
import { COLUMNAS_OPCIONALES, CLAVES_SUMABLES, formatearNumero, formatearCelda } from "@/lib/columnas";

const POSICIONES = ["Portero", "Defensa", "Mediocampista", "Delantero"];

type ClaveOrdenable = (typeof COLUMNAS_OPCIONALES)[number]["clave"];

function compararPorClave(a: Jugador, b: Jugador, clave: ClaveOrdenable, direccion: "asc" | "desc"): number {
  const columna = COLUMNAS_OPCIONALES.find((c) => c.clave === clave);

  if (columna?.tipo === "texto") {
    const va = a[clave] as string | null;
    const vb = b[clave] as string | null;
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return direccion === "asc" ? va.localeCompare(vb, "es") : vb.localeCompare(va, "es");
  }

  const va = a[clave] as number | null;
  const vb = b[clave] as number | null;
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  return direccion === "asc" ? va - vb : vb - va;
}

export function Explorador({ jugadores }: { jugadores: Jugador[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [posicionesSel, setPosicionesSel] = useState<string[]>([]);
  const [equiposSel, setEquiposSel] = useState<string[]>([]);
  const [columnasVisibles, setColumnasVisibles] = useState<ColumnasVisibles>({});
  const [orden, setOrden] = useState<{ clave: ClaveOrdenable; direccion: "asc" | "desc" }>({
    clave: "valor",
    direccion: "desc",
  });
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [modalValor, setModalValor] = useState<Jugador | null>(null);
  const [modalPuntos, setModalPuntos] = useState<Jugador | null>(null);

  const equipos = useMemo(
    () =>
      Array.from(new Set(jugadores.map((j) => j.equipo))).sort(
        (a, b) => ORDEN_EQUIPOS.indexOf(a) - ORDEN_EQUIPOS.indexOf(b)
      ),
    [jugadores]
  );

  const nombresOficialesEquipo = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const j of jugadores) {
      if (j.equipoNombreOficial) mapa[j.equipo] = j.equipoNombreOficial;
    }
    return mapa;
  }, [jugadores]);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    const resultado = jugadores.filter((j) => {
      if (texto && !j.nombre.toLowerCase().includes(texto)) return false;
      if (posicionesSel.length > 0 && !posicionesSel.includes(j.posicion)) return false;
      if (equiposSel.length > 0 && !equiposSel.includes(j.equipo)) return false;
      return true;
    });

    return [...resultado].sort((a, b) => compararPorClave(a, b, orden.clave, orden.direccion));
  }, [jugadores, busqueda, posicionesSel, equiposSel, orden]);

  function alternarSeleccion(id: number) {
    setSeleccionados((actual) =>
      actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]
    );
  }

  function alternarOrden(clave: ClaveOrdenable) {
    setOrden((actual) =>
      actual.clave === clave
        ? { clave, direccion: actual.direccion === "asc" ? "desc" : "asc" }
        : { clave, direccion: "desc" }
    );
  }

  const porId = useMemo(() => new Map(jugadores.map((j) => [j.id, j])), [jugadores]);
  const fijados = seleccionados.map((id) => porId.get(id)).filter((j): j is Jugador => j !== undefined);
  const filas = [...fijados, ...filtrados.filter((j) => !seleccionados.includes(j.id))];

  const columnas = COLUMNAS_OPCIONALES.filter((columna) => columnasVisibles[columna.clave]);
  const columnasNumericas = COLUMNAS_OPCIONALES.filter((columna) => columna.tipo !== "texto");

  const totalesEquipo = useMemo(() => {
    if (equiposSel.length !== 1 || seleccionados.length !== 0) return null;
    const nombreEquipo = equiposSel[0];
    const jugadoresEquipo = jugadores.filter((j) => j.equipo === nombreEquipo);
    if (jugadoresEquipo.length === 0) return null;

    const totales = Object.fromEntries(
      COLUMNAS_OPCIONALES.filter((columna) => columna.tipo !== "texto").map((columna) => {
        const valores = jugadoresEquipo
          .map((j) => j[columna.clave] as number | null)
          .filter((v): v is number => v !== null);
        if (valores.length === 0) return [columna.clave, null];
        const suma = valores.reduce((a, b) => a + b, 0);
        return [columna.clave, CLAVES_SUMABLES.has(columna.clave) ? suma : suma / valores.length];
      })
    ) as Record<string, number | null>;

    return {
      nombreEquipo,
      equipoId: jugadoresEquipo[0].equipoId,
      numJugadores: jugadoresEquipo.length,
      totales,
    };
  }, [jugadores, equiposSel, seleccionados]);

  return (
    <div className="flex flex-col gap-6 px-6 pb-16 max-w-[1104px] mx-auto w-full pt-8">
      <div className="flex flex-wrap gap-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar a un jugador"
          className="h-12 bg-white rounded-[14px] px-4 text-sm flex-1 min-w-[200px] transition-colors duration-200 hover:bg-[#FAFAFC]"
        />
        <MenuMultiSeleccion
          etiqueta="Equipos"
          opciones={equipos}
          etiquetas={nombresOficialesEquipo}
          seleccionados={equiposSel}
          onChange={setEquiposSel}
        />
        <MenuMultiSeleccion
          etiqueta="Posiciones"
          opciones={POSICIONES}
          seleccionados={posicionesSel}
          onChange={setPosicionesSel}
        />
        <MenuFiltros columnas={columnasVisibles} onChangeColumnas={setColumnasVisibles} />
      </div>

      {!seleccionados.length && totalesEquipo && (
        <section className="rounded-2xl bg-white p-4">
          <div className="flex items-center gap-2 mb-4">
            {totalesEquipo.equipoId !== null && (
              <Avatar src={urlEscudoEquipo(totalesEquipo.equipoId)!} alt={totalesEquipo.nombreEquipo} size={28} />
            )}
            <h2 className="text-sm font-medium text-neutral-700">
              Totales de {totalesEquipo.nombreEquipo} · {totalesEquipo.numJugadores} jugadores
            </h2>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            {columnasNumericas.map((columna) => (
              <div key={columna.clave} className="flex items-center justify-between gap-2">
                <dt className="text-neutral-500 truncate">{columna.etiqueta}</dt>
                <dd className="tabular-nums font-medium">
                  {formatearNumero(totalesEquipo.totales[columna.clave], columna.decimales ?? 0)}
                  {columna.sufijo ?? ""}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="overflow-x-auto rounded-[18px] bg-white">
        <table className="text-sm border-separate border-spacing-0 w-full">
          <thead className="text-neutral-500 text-left">
            <tr>
              <th className="p-3 w-10 sticky left-0 bg-white z-10"></th>
              <th className="p-3 sticky left-10 bg-white z-10 whitespace-nowrap">Jugador</th>
              <th className="p-3 whitespace-nowrap">Equipo</th>
              <th className="p-3 whitespace-nowrap">Posición</th>
              <th className="p-3 whitespace-nowrap">Estado</th>
              {columnas.map((columna) => (
                <th
                  key={columna.clave}
                  onClick={() => alternarOrden(columna.clave)}
                  className="p-3 text-right whitespace-nowrap cursor-pointer select-none hover:text-neutral-800"
                >
                  {columna.etiqueta}
                  {orden.clave === columna.clave ? (orden.direccion === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((j, i) => {
              const marcado = seleccionados.includes(j.id);
              const bg = i % 2 === 0 ? "rgba(29,29,31,0.04)" : "#FFFFFF";
              return (
                <tr
                  key={j.id}
                  onClick={() => alternarSeleccion(j.id)}
                  style={{ backgroundColor: bg }}
                  className="cursor-pointer transition-colors duration-200 hover:bg-[#FAFAFC]"
                >
                  <td className="p-3 sticky left-0" style={{ backgroundColor: bg }}>
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternarSeleccion(j.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="p-3 sticky left-10" style={{ backgroundColor: bg }}>
                    <div className="flex items-center gap-2">
                      <Avatar src={urlFotoJugador(j.id)} alt={j.nombre} size={32} />
                      <span className="whitespace-nowrap">{j.nombre}</span>
                    </div>
                  </td>
                  <td className="p-3 text-neutral-500">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {j.equipoId !== null && <Avatar src={urlEscudoEquipo(j.equipoId)!} alt={j.equipo} size={20} />}
                      {j.equipoNombreOficial ?? j.equipo}
                    </div>
                  </td>
                  <td className="p-3 text-neutral-500 whitespace-nowrap">{j.posicion}</td>
                  <td className="p-3 text-neutral-500 whitespace-nowrap max-w-[220px] truncate" title={formatearEstado(j.estado)}>
                    {formatearEstado(j.estado)}
                  </td>

                  {columnas.map((columna) => {
                    const texto = formatearCelda(columna, j[columna.clave]);

                    if (columna.clave === "valor") {
                      return (
                        <td key={columna.clave} className="p-3 text-right tabular-nums">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalValor(j);
                            }}
                            className="underline decoration-dotted underline-offset-2 hover:text-[#e83d50]"
                          >
                            {texto}
                          </button>
                        </td>
                      );
                    }

                    if (columna.clave === "puntosTotales") {
                      return (
                        <td key={columna.clave} className="p-3 text-right tabular-nums">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalPuntos(j);
                            }}
                            className="underline decoration-dotted underline-offset-2 hover:text-[#e83d50]"
                          >
                            {texto}
                          </button>
                        </td>
                      );
                    }

                    return (
                      <td key={columna.clave} className="p-3 text-right tabular-nums text-neutral-700">
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

      {modalValor && <GraficaValor jugador={modalValor} onClose={() => setModalValor(null)} />}
      {modalPuntos && <HistorialPuntos jugador={modalPuntos} onClose={() => setModalPuntos(null)} />}
    </div>
  );
}
