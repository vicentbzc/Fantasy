"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Jugador } from "@/lib/db";
import { ORDEN_EQUIPOS } from "@/lib/equipos";
import { Avatar } from "./Avatar";
import { MenuMultiSeleccion } from "./MenuMultiSeleccion";
import { MenuFiltros, type ColumnasVisibles } from "./MenuFiltros";
import { GraficaValor } from "./GraficaValor";
import { HistorialPuntos } from "./HistorialPuntos";
import { urlFotoJugador, urlEscudoEquipo } from "@/lib/imagenes";
import { COLUMNAS_OPCIONALES, CLAVES_SUMABLES, formatearCelda } from "@/lib/columnas";
import { normalizarTexto } from "@/lib/texto";
import { COLOR_DIFICULTAD, ORDEN_DIFICULTAD } from "@/lib/formato";
import { FlechaAceleracion } from "./FlechaAceleracion";
import { ProximosPartidos } from "./ProximosPartidos";
import { usePersistedState } from "@/lib/usePersistedState";

const POSICIONES = ["Portero", "Defensa", "Mediocampista", "Delantero"];
const CLAVES_EXCLUIDAS_TOTALES = new Set<keyof Jugador>([
  "porcentajeTitularidad",
  "porcentajeDiferencia",
  "tendenciaDias",
  "minutosJugados",
  "valor",
]);
const CLAVES_REVALORIZACION = new Set<keyof Jugador>(["diferenciaValor", "porcentajeDiferencia"]);
const CLAVES_NO_ORDENABLES = new Set<keyof Jugador>(["estado", "posicion"]);
const COLUMNAS_DEFECTO_VISIBLES: ColumnasVisibles = {
  posicion: true,
  porcentajeTitularidad: true,
  valorSinClausula: true,
  valor: true,
  diferenciaValor: true,
  puntosUltimaJornada: true,
  proximoRival: true,
};

type ClaveOrdenable = (typeof COLUMNAS_OPCIONALES)[number]["clave"] | "nombre";

function colorRevalorizacion(valor: number | null): string | undefined {
  if (valor === null || valor === 0) return undefined;
  return valor > 0 ? "#3BB568" : "#FE645F";
}

function compararPorClave(a: Jugador, b: Jugador, clave: ClaveOrdenable, direccion: "asc" | "desc"): number {
  if (clave === "nombre") {
    return direccion === "asc" ? a.nombre.localeCompare(b.nombre, "es") : b.nombre.localeCompare(a.nombre, "es");
  }

  if (clave === "proximoRival") {
    const va = a.proximaDificultad ? ORDEN_DIFICULTAD[a.proximaDificultad] ?? null : null;
    const vb = b.proximaDificultad ? ORDEN_DIFICULTAD[b.proximaDificultad] ?? null : null;
    if (va === null && vb === null) return 0;
    if (va === null) return direccion === "asc" ? -1 : 1;
    if (vb === null) return direccion === "asc" ? 1 : -1;
    return direccion === "asc" ? va - vb : vb - va;
  }

  const columna = COLUMNAS_OPCIONALES.find((c) => c.clave === clave);

  if (columna?.tipo === "texto") {
    const va = a[clave] as string | null;
    const vb = b[clave] as string | null;
    if (va === null && vb === null) return 0;
    if (va === null) return direccion === "asc" ? -1 : 1;
    if (vb === null) return direccion === "asc" ? 1 : -1;
    return direccion === "asc" ? va.localeCompare(vb, "es") : vb.localeCompare(va, "es");
  }

  const va = a[clave] as number | null;
  const vb = b[clave] as number | null;
  if (va === null && vb === null) return 0;
  if (va === null) return direccion === "asc" ? -1 : 1;
  if (vb === null) return direccion === "asc" ? 1 : -1;
  return direccion === "asc" ? va - vb : vb - va;
}

export function Explorador({ jugadores }: { jugadores: Jugador[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busqueda, setBusqueda] = usePersistedState("fantasy.jugadores.busqueda", "");
  const [posicionesSel, setPosicionesSel] = usePersistedState<string[]>("fantasy.jugadores.posiciones", []);
  const [equiposSel, setEquiposSel] = usePersistedState<string[]>("fantasy.jugadores.equipos", []);
  const [columnasVisibles, setColumnasVisibles] = usePersistedState<ColumnasVisibles>(
    "fantasy.jugadores.columnas.v2",
    COLUMNAS_DEFECTO_VISIBLES
  );
  const [orden, setOrden] = usePersistedState<{ clave: ClaveOrdenable | null; direccion: "asc" | "desc" }>(
    "fantasy.jugadores.orden.v2",
    { clave: null, direccion: "desc" }
  );
  const [seleccionados, setSeleccionados] = usePersistedState<number[]>("fantasy.jugadores.seleccionados", []);
  const [modalValor, setModalValor] = useState<Jugador | null>(null);
  const [modalPuntos, setModalPuntos] = useState<Jugador | null>(null);
  const [modalUltimaJornada, setModalUltimaJornada] = useState<Jugador | null>(null);
  const [modalPartidos, setModalPartidos] = useState<Jugador | null>(null);
  const [filaResaltada, setFilaResaltada] = useState<number | null>(null);

  useEffect(() => {
    const idParam = searchParams.get("seleccionado");
    if (!idParam) return;
    const id = Number(idParam);
    if (!Number.isFinite(id)) return;
    setBusqueda("");
    setPosicionesSel([]);
    setEquiposSel([]);
    setSeleccionados([id]);
    router.replace("/jugadores", { scroll: false });
  }, [searchParams, router, setBusqueda, setPosicionesSel, setEquiposSel, setSeleccionados]);

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
    const texto = normalizarTexto(busqueda.trim());

    const resultado = jugadores.filter((j) => {
      if (texto && !normalizarTexto(j.nombre).includes(texto)) return false;
      if (posicionesSel.length > 0 && !posicionesSel.includes(j.posicion)) return false;
      if (equiposSel.length > 0 && !equiposSel.includes(j.equipo)) return false;
      return true;
    });

    return [...resultado].sort((a, b) =>
      orden.clave === null
        ? compararPorClave(a, b, "nombre", "asc")
        : compararPorClave(a, b, orden.clave, orden.direccion)
    );
  }, [jugadores, busqueda, posicionesSel, equiposSel, orden]);

  function alternarSeleccion(id: number) {
    setSeleccionados((actual) =>
      actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]
    );
  }

  function alternarOrden(clave: ClaveOrdenable) {
    setOrden((actual) => {
      if (actual.clave !== clave) return { clave, direccion: "desc" };
      if (actual.direccion === "desc") return { clave, direccion: "asc" };
      return { clave: null, direccion: "desc" };
    });
  }

  const porId = useMemo(() => new Map(jugadores.map((j) => [j.id, j])), [jugadores]);
  const fijados = seleccionados.map((id) => porId.get(id)).filter((j): j is Jugador => j !== undefined);
  const filas = [...fijados, ...filtrados.filter((j) => !seleccionados.includes(j.id))];

  const columnas = COLUMNAS_OPCIONALES.filter((columna) => columnasVisibles[columna.clave]);
  const columnasTotales = COLUMNAS_OPCIONALES.filter(
    (columna) => columna.tipo !== "texto" && !CLAVES_EXCLUIDAS_TOTALES.has(columna.clave)
  );

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
      nombreEquipo: jugadoresEquipo[0].equipoNombreOficial ?? nombreEquipo,
      totales,
    };
  }, [jugadores, equiposSel, seleccionados]);

  return (
    <div className="flex flex-col gap-6 px-6 sm:px-12 pb-16 max-w-[1576px] mx-auto w-full pt-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:justify-center">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar a un jugador"
          className="h-12 bg-white rounded-[14px] px-4 text-sm w-full lg:w-64 transition-colors duration-200 hover:bg-[#FAFAFC]"
        />
        <div className="grid grid-cols-3 gap-2 lg:contents">
          <MenuMultiSeleccion
            etiqueta="Equipos"
            opciones={equipos}
            etiquetas={nombresOficialesEquipo}
            seleccionados={equiposSel}
            onChange={setEquiposSel}
            className="w-full lg:w-[180px]"
          />
          <MenuMultiSeleccion
            etiqueta="Posiciones"
            opciones={POSICIONES}
            seleccionados={posicionesSel}
            onChange={setPosicionesSel}
            className="w-full lg:w-[180px]"
          />
          <MenuFiltros
            columnas={columnasVisibles}
            onChangeColumnas={setColumnasVisibles}
            className="w-full lg:w-[180px]"
          />
        </div>
      </div>

      {!seleccionados.length && totalesEquipo && (
        <section className="rounded-2xl bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-4">{totalesEquipo.nombreEquipo}</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            {columnasTotales.map((columna) => (
              <div key={columna.clave} className="flex items-center justify-between gap-2">
                <dt className="text-neutral-500 truncate">{columna.etiqueta}</dt>
                <dd
                  className="tabular-nums font-medium"
                  style={{
                    color: CLAVES_REVALORIZACION.has(columna.clave)
                      ? colorRevalorizacion(totalesEquipo.totales[columna.clave])
                      : undefined,
                  }}
                >
                  {formatearCelda(columna, totalesEquipo.totales[columna.clave])}
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
              <th className="py-3 px-3 max-sm:px-4 w-[210px] sm:w-[300px] sticky left-0 bg-white z-10 whitespace-nowrap">Jugador</th>
              {columnas.map((columna) => {
                const ordenable = !CLAVES_NO_ORDENABLES.has(columna.clave);
                return (
                  <th
                    key={columna.clave}
                    onClick={ordenable ? () => alternarOrden(columna.clave) : undefined}
                    className={`py-3 px-3 max-sm:px-4 text-left whitespace-nowrap ${
                      columna.clave === "estado" ? "min-w-[220px]" : ""
                    } ${ordenable ? "cursor-pointer select-none hover:text-neutral-800" : ""}`}
                  >
                    {columna.etiqueta}
                    {ordenable && orden.clave === columna.clave && (
                      <span className="text-neutral-400 text-xs"> {orden.direccion === "asc" ? "▴" : "▾"}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filas.map((j, i) => {
              const marcado = seleccionados.includes(j.id);
              const bg = i % 2 === 0 ? "#F5F5F7" : "#FFFFFF";
              const resaltada = filaResaltada === j.id;
              return (
                <tr
                  key={j.id}
                  onClick={() => alternarSeleccion(j.id)}
                  onMouseEnter={() => setFilaResaltada(j.id)}
                  onMouseLeave={() => setFilaResaltada(null)}
                  style={{ backgroundColor: resaltada ? "#FAFAFC" : bg }}
                  className="cursor-pointer transition-colors duration-200"
                >
                  <td
                    className="py-3 px-3 max-sm:px-4 w-[210px] sm:w-[300px] sticky left-0 z-10 overflow-hidden transition-colors duration-200"
                    style={{ backgroundColor: resaltada ? "#FAFAFC" : bg }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternarSeleccion(j.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 max-sm:hidden"
                      />
                      <Avatar src={urlFotoJugador(j.id)} alt={j.nombre} size={32} />
                      <span className="truncate min-w-0">{j.nombre}</span>
                      {j.equipoId !== null && (
                        <Avatar
                          src={urlEscudoEquipo(j.equipoId)!}
                          alt={j.equipoNombreOficial ?? j.equipo}
                          size={18}
                        />
                      )}
                    </div>
                  </td>

                  {columnas.map((columna) => {
                    const colorRevalor = CLAVES_REVALORIZACION.has(columna.clave)
                      ? colorRevalorizacion(j[columna.clave] as number | null)
                      : undefined;

                    const texto = formatearCelda(columna, j[columna.clave]);

                    if (columna.clave === "valorSinClausula") {
                      return (
                        <td key={columna.clave} className="py-3 px-3 max-sm:px-4 text-left tabular-nums">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalValor(j);
                            }}
                            className="underline decoration-dotted underline-offset-2 hover:text-[#FE8B87]"
                          >
                            {texto}
                          </button>
                        </td>
                      );
                    }

                    if (columna.clave === "puntosTotales") {
                      return (
                        <td key={columna.clave} className="py-3 px-3 max-sm:px-4 text-left tabular-nums">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalPuntos(j);
                            }}
                            className="underline decoration-dotted underline-offset-2 hover:text-[#FE8B87]"
                          >
                            {texto}
                          </button>
                        </td>
                      );
                    }

                    if (columna.clave === "puntosUltimaJornada") {
                      return (
                        <td key={columna.clave} className="py-3 px-3 max-sm:px-4 text-left tabular-nums">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalUltimaJornada(j);
                            }}
                            className="underline decoration-dotted underline-offset-2 hover:text-[#FE8B87]"
                          >
                            {texto}
                          </button>
                        </td>
                      );
                    }

                    if (columna.clave === "diferenciaValor") {
                      return (
                        <td key={columna.clave} className="py-3 px-3 max-sm:px-4 text-left tabular-nums whitespace-nowrap">
                          <span style={{ color: colorRevalor }}>{texto}</span>
                          <FlechaAceleracion aceleracion={j.aceleracion} className="ml-1" />
                        </td>
                      );
                    }

                    if (columna.clave === "proximoRival") {
                      const nombreRival = j.proximoRivalNombreOficial ?? j.proximoRival;
                      const colorDificultad = j.proximaDificultad
                        ? COLOR_DIFICULTAD[j.proximaDificultad]
                        : undefined;
                      if (!nombreRival) {
                        return (
                          <td key={columna.clave} className="py-3 px-3 max-sm:px-4 text-left text-neutral-500">
                            —
                          </td>
                        );
                      }
                      if (j.equipoId === null) {
                        return (
                          <td
                            key={columna.clave}
                            className="py-3 px-3 max-sm:px-4 text-left whitespace-nowrap"
                            style={{ color: colorDificultad }}
                          >
                            {nombreRival}
                          </td>
                        );
                      }
                      return (
                        <td key={columna.clave} className="py-3 px-3 max-sm:px-4 text-left whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalPartidos(j);
                            }}
                            className="underline decoration-dotted underline-offset-2 hover:opacity-70"
                            style={{ color: colorDificultad }}
                          >
                            {nombreRival}
                          </button>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={columna.clave}
                        className={`py-3 px-3 max-sm:px-4 text-left tabular-nums text-neutral-700 whitespace-nowrap ${
                          columna.clave === "estado" ? "min-w-[220px]" : ""
                        }`}
                        style={{ color: colorRevalor }}
                      >
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
      {modalUltimaJornada && (
        <HistorialPuntos
          jugador={modalUltimaJornada}
          onClose={() => setModalUltimaJornada(null)}
          soloUltimaJornada
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
