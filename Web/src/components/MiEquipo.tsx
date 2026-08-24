"use client";

import { useState } from "react";
import type { Jugador, MiClub, EstadoMiEquipo, JugadorProbable } from "@/lib/db";
import { CampoTactico } from "./CampoTactico";
import { Banquillo } from "./Banquillo";
import { BotonAgregar } from "./BotonAgregar";
import { TarjetaEstadistica } from "./TarjetaEstadistica";
import { FotoJugadorSlot } from "./FotoJugadorSlot";
import { BuscadorJugador } from "./BuscadorJugador";
import { MenuFiltros, type ColumnasVisibles } from "./MenuFiltros";
import { urlFotoJugador } from "@/lib/imagenes";
import { formatearValor, bucketDificultadCalendario, COLOR_DIFICULTAD_CALENDARIO } from "@/lib/formato";
import { COLUMNAS_OPCIONALES } from "@/lib/columnas";
import { LINEAS_ORDEN, type Formacion } from "@/lib/formacion";
import { accionEstablecerEstadoMiEquipo, accionEliminarDeMiEquipo } from "@/app/actions";

const CLAVES_PERMITIDAS = new Set<keyof Jugador>(["porcentajeTitularidad", "valor", "diferenciaValor", "dificultadProximos5"]);
const EXCLUIR_FILTROS = COLUMNAS_OPCIONALES.filter((c) => !CLAVES_PERMITIDAS.has(c.clave)).map((c) => c.clave);

const ETIQUETAS_ESTADO: Record<EstadoMiEquipo, string> = {
  titular: "Poner como titular",
  suplente: "Poner como suplente",
  duda: "Poner en duda",
  seguimiento: "Poner en seguimiento",
};

function aProbable(j: Jugador): JugadorProbable {
  return { id: j.id, nombre: j.nombre, posicion: j.posicion, probabilidad: j.porcentajeTitularidad, posX: null, posY: null };
}

function lineasParaJugador(
  j: Jugador,
  columnasVisibles: ColumnasVisibles,
  permitirColor: boolean
): { texto: string; color?: string }[] {
  const lineas: { texto: string; color?: string }[] = [];
  if (columnasVisibles.porcentajeTitularidad) {
    lineas.push({ texto: j.porcentajeTitularidad === null ? "—" : `${j.porcentajeTitularidad}%` });
  }
  if (columnasVisibles.valor) {
    lineas.push({ texto: formatearValor(j.valor) });
  }
  if (columnasVisibles.diferenciaValor) {
    const color =
      !permitirColor || j.diferenciaValor === null || j.diferenciaValor === 0
        ? undefined
        : j.diferenciaValor > 0
          ? "#16A34A"
          : "#DC2626";
    lineas.push({ texto: formatearValor(j.diferenciaValor), color });
  }
  if (columnasVisibles.dificultadProximos5) {
    const bucket = bucketDificultadCalendario(j.dificultadProximos5);
    lineas.push({ texto: bucket ?? "—", color: permitirColor && bucket ? COLOR_DIFICULTAD_CALENDARIO[bucket] : undefined });
  }
  return lineas;
}

export function MiEquipo({ jugadores, miClub }: { jugadores: Jugador[]; miClub: MiClub }) {
  const [columnasVisibles, setColumnasVisibles] = useState<ColumnasVisibles>({});
  const [buscador, setBuscador] = useState<EstadoMiEquipo | null>(null);
  const [menuJugador, setMenuJugador] = useState<Jugador | null>(null);

  const titulares = jugadores.filter((j) => j.estadoMiEquipo === "titular");
  const suplentes = jugadores.filter((j) => j.estadoMiEquipo === "suplente");
  const enDuda = jugadores.filter((j) => j.estadoMiEquipo === "duda");
  const seguimiento = jugadores.filter((j) => j.estadoMiEquipo === "seguimiento");
  const idsAsignados = new Set(jugadores.filter((j) => j.estadoMiEquipo !== null).map((j) => j.id));

  const valorEquipo = [...titulares, ...suplentes].reduce((acc, j) => acc + (j.valor ?? 0), 0);
  const revalorizacion = [...titulares, ...suplentes].reduce((acc, j) => acc + (j.diferenciaValor ?? 0), 0);
  const valorClub = valorEquipo + (miClub.dinero ?? 0);
  const colorRevalorizacion = revalorizacion > 0 ? "#16A34A" : revalorizacion < 0 ? "#DC2626" : undefined;

  const porteroTitular = titulares.find((j) => j.posicion === "Portero") ?? null;
  const outfieldTitulares = titulares.filter((j) => j.posicion !== "Portero");
  const lineasCampo = LINEAS_ORDEN.map((pos) => outfieldTitulares.filter((j) => j.posicion === pos).map(aProbable)).filter(
    (l) => l.length > 0
  );
  const formacion: Formacion = {
    portero: porteroTitular ? aProbable(porteroTitular) : null,
    lineas: lineasCampo,
    posicionesReales: null,
    banquillo: suplentes.map(aProbable),
  };

  const datosPorJugadorCampo = Object.fromEntries(
    [...titulares, ...suplentes].map((j) => [j.id, lineasParaJugador(j, columnasVisibles, false)])
  );
  const datosPorJugadorTarjeta = Object.fromEntries(
    jugadores.map((j) => [j.id, lineasParaJugador(j, columnasVisibles, true)])
  );

  function abrirMenu(id: number) {
    const j = jugadores.find((x) => x.id === id);
    if (j) setMenuJugador(j);
  }

  async function establecer(id: number, estado: EstadoMiEquipo) {
    setMenuJugador(null);
    setBuscador(null);
    await accionEstablecerEstadoMiEquipo(id, estado);
  }

  async function eliminar(id: number) {
    setMenuJugador(null);
    await accionEliminarDeMiEquipo(id);
  }

  return (
    <div className="max-w-[700px] mx-auto w-full px-6 pt-14 pb-22 flex flex-col items-center gap-14 text-center">
      <div className="grid grid-cols-2 gap-3 w-full">
        <TarjetaEstadistica etiqueta="Valor de mi club" valor={formatearValor(valorClub)} />
        <TarjetaEstadistica etiqueta="Valor de mi equipo" valor={formatearValor(valorEquipo)} />
        <TarjetaEstadistica etiqueta="Revalorización" valor={formatearValor(revalorizacion)} color={colorRevalorizacion} />
        <TarjetaEstadistica etiqueta="Fichas de mi equipo" valor={miClub.fichas === null ? "—" : String(miClub.fichas)} />
      </div>

      <div className="relative w-full">
        <CampoTactico formacion={formacion} datosPorJugador={datosPorJugadorCampo} onClickJugador={abrirMenu} />
        <div className="absolute top-4 right-4">
          <MenuFiltros columnas={columnasVisibles} onChangeColumnas={setColumnasVisibles} excluir={EXCLUIR_FILTROS} />
        </div>
        <div className="absolute bottom-4 left-4">
          <BotonAgregar size={40} onClick={() => setBuscador("titular")} className="bg-[#F5F5F7]" />
        </div>
      </div>

      <Banquillo
        jugadores={formacion.banquillo}
        mostrarAgregar
        onAgregar={() => setBuscador("suplente")}
        datosPorJugador={datosPorJugadorTarjeta}
        onClickJugador={abrirMenu}
      />

      <div className="w-full flex flex-col items-start gap-[18px]">
        <h2 className="text-[20px] font-bold">En duda</h2>
        <div className="w-full rounded-[18px] bg-white p-[18px] flex flex-wrap justify-start gap-[14px]">
          {enDuda.length === 0 && <p className="text-sm text-neutral-400">Nadie en duda ahora mismo.</p>}
          {enDuda.map((j) => (
            <FotoJugadorSlot
              key={j.id}
              src={urlFotoJugador(j.id)}
              alt={j.nombre}
              size={62}
              radius={12}
              probabilidad={j.porcentajeTitularidad}
              colorProbabilidad="#6E6E73"
              fontSizeProbabilidad={14}
              lineas={datosPorJugadorTarjeta[j.id]}
              onClick={() => abrirMenu(j.id)}
            />
          ))}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-bold leading-none opacity-0">+</span>
            <BotonAgregar size={62} onClick={() => setBuscador("duda")} className="bg-[#F5F5F7]" />
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col items-start gap-[18px]">
        <h2 className="text-[20px] font-bold">Seguimiento</h2>
        <div className="w-full rounded-[18px] bg-white p-[18px] flex flex-wrap justify-start gap-[14px]">
          {seguimiento.length === 0 && <p className="text-sm text-neutral-400">Nadie en seguimiento ahora mismo.</p>}
          {seguimiento.map((j) => (
            <FotoJugadorSlot
              key={j.id}
              src={urlFotoJugador(j.id)}
              alt={j.nombre}
              size={62}
              radius={12}
              probabilidad={j.porcentajeTitularidad}
              colorProbabilidad="#6E6E73"
              fontSizeProbabilidad={14}
              lineas={datosPorJugadorTarjeta[j.id]}
              onClick={() => abrirMenu(j.id)}
            />
          ))}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-bold leading-none opacity-0">+</span>
            <BotonAgregar size={62} onClick={() => setBuscador("seguimiento")} className="bg-[#F5F5F7]" />
          </div>
        </div>
      </div>

      {buscador && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setBuscador(null)}
        >
          <BuscadorJugador
            jugadores={jugadores}
            excluirIds={idsAsignados}
            onSeleccionar={(id) => establecer(id, buscador)}
            className="w-64 max-h-72 overflow-y-auto rounded-2xl bg-white shadow-lg p-2"
          />
        </div>
      )}

      {menuJugador && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setMenuJugador(null)}
        >
          <div className="bg-white rounded-2xl p-4 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm mb-2 px-2">{menuJugador.nombre}</p>
            <div className="flex flex-col">
              {(Object.keys(ETIQUETAS_ESTADO) as EstadoMiEquipo[])
                .filter((estado) => menuJugador.estadoMiEquipo !== estado)
                .map((estado) => (
                  <button
                    key={estado}
                    type="button"
                    onClick={() => establecer(menuJugador.id, estado)}
                    className="w-full text-left px-2 py-2 rounded-lg text-sm transition-colors duration-200 hover:bg-[#FAFAFC]"
                  >
                    {ETIQUETAS_ESTADO[estado]}
                  </button>
                ))}
              {menuJugador.estadoMiEquipo !== null && (
                <button
                  type="button"
                  onClick={() => eliminar(menuJugador.id)}
                  className="w-full text-left px-2 py-2 rounded-lg text-sm text-[#DC2626] transition-colors duration-200 hover:bg-[#FAFAFC]"
                >
                  Eliminar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
