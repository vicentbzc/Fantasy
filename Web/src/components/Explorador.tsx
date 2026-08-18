"use client";

import { useMemo, useState } from "react";
import type { Jugador } from "@/lib/db";
import { Avatar } from "./Avatar";
import { MenuMultiSeleccion } from "./MenuMultiSeleccion";
import { MenuFiltros, type FiltrosNumericos } from "./MenuFiltros";
import { GraficaValor } from "./GraficaValor";
import { HistorialPuntos } from "./HistorialPuntos";
import { urlFotoJugador, urlEscudoEquipo } from "@/lib/imagenes";
import { formatearEstado } from "@/lib/formato";
import { COLUMNAS_NUMERICAS, CLAVES_SUMABLES, formatearNumero, cumpleFiltroNumerico } from "@/lib/columnas";

const POSICIONES = ["Portero", "Defensa", "Mediocampista", "Delantero"];

type ClaveOrdenable = (typeof COLUMNAS_NUMERICAS)[number]["clave"];

export function Explorador({ jugadores }: { jugadores: Jugador[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [posicionesSel, setPosicionesSel] = useState<string[]>([]);
  const [equiposSel, setEquiposSel] = useState<string[]>([]);
  const [aceleracionSel, setAceleracionSel] = useState<string[]>([]);
  const [filtrosNumericos, setFiltrosNumericos] = useState<FiltrosNumericos>({});
  const [orden, setOrden] = useState<{ clave: ClaveOrdenable; direccion: "asc" | "desc" }>({
    clave: "valor",
    direccion: "desc",
  });
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [modalValor, setModalValor] = useState<Jugador | null>(null);
  const [modalPuntos, setModalPuntos] = useState<Jugador | null>(null);

  const equipos = useMemo(
    () => Array.from(new Set(jugadores.map((j) => j.equipo))).sort((a, b) => a.localeCompare(b, "es")),
    [jugadores]
  );

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    const resultado = jugadores.filter((j) => {
      if (texto && !j.nombre.toLowerCase().includes(texto)) return false;
      if (posicionesSel.length > 0 && !posicionesSel.includes(j.posicion)) return false;
      if (equiposSel.length > 0 && !equiposSel.includes(j.equipo)) return false;
      if (aceleracionSel.length > 0 && !(j.aceleracion && aceleracionSel.includes(j.aceleracion))) return false;

      for (const clave of Object.keys(filtrosNumericos) as (keyof Jugador)[]) {
        const filtro = filtrosNumericos[clave];
        if (!filtro) continue;
        const valor = j[clave] as number | null;
        if (!cumpleFiltroNumerico(valor, filtro.operador, filtro.valor)) return false;
      }

      return true;
    });

    return [...resultado].sort((a, b) => {
      const va = a[orden.clave] as number | null;
      const vb = b[orden.clave] as number | null;
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return orden.direccion === "asc" ? va - vb : vb - va;
    });
  }, [jugadores, busqueda, posicionesSel, equiposSel, aceleracionSel, filtrosNumericos, orden]);

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

  const columnasVisibles = COLUMNAS_NUMERICAS.filter((columna) => filtrosNumericos[columna.clave] !== undefined);

  const totalesEquipo = useMemo(() => {
    if (equiposSel.length !== 1 || seleccionados.length !== 0) return null;
    const nombreEquipo = equiposSel[0];
    const jugadoresEquipo = jugadores.filter((j) => j.equipo === nombreEquipo);
    if (jugadoresEquipo.length === 0) return null;

    const totales = Object.fromEntries(
      COLUMNAS_NUMERICAS.map((columna) => {
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
          className="h-12 bg-white rounded-[14px] px-4 text-sm flex-1 min-w-[200px]"
        />
        <MenuMultiSeleccion etiqueta="Equipos" opciones={equipos} seleccionados={equiposSel} onChange={setEquiposSel} />
        <MenuMultiSeleccion
          etiqueta="Posiciones"
          opciones={POSICIONES}
          seleccionados={posicionesSel}
          onChange={setPosicionesSel}
        />
        <MenuFiltros
          filtros={filtrosNumericos}
          onChangeFiltros={setFiltrosNumericos}
          aceleracion={aceleracionSel}
          onChangeAceleracion={setAceleracionSel}
        />
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
            {COLUMNAS_NUMERICAS.map((columna) => (
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
              <th className="p-3 whitespace-nowrap">Aceleración</th>
              {columnasVisibles.map((columna) => (
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
                  <td className="p-3 text-neutral-500 whitespace-nowrap">{j.aceleracion ?? "—"}</td>

                  {columnasVisibles.map((columna) => {
                    const valorCelda = formatearNumero(j[columna.clave] as number | null, columna.decimales ?? 0);
                    const texto = `${valorCelda}${columna.sufijo ?? ""}`;

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
