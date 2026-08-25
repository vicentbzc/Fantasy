"use client";

import { useState } from "react";
import type { Jugador, MiClub, EstadoMiEquipo, JugadorProbable } from "@/lib/db";
import { CampoTactico } from "./CampoTactico";
import { Banquillo } from "./Banquillo";
import { BotonAgregar } from "./BotonAgregar";
import { RanuraAgregar } from "./RanuraAgregar";
import { TarjetaEstadistica } from "./TarjetaEstadistica";
import { FotoJugadorSlot } from "./FotoJugadorSlot";
import { BuscadorJugador } from "./BuscadorJugador";
import { ProximosPartidos } from "./ProximosPartidos";
import { MenuFiltros, type ColumnasVisibles } from "./MenuFiltros";
import { urlFotoJugador } from "@/lib/imagenes";
import {
  formatearValor,
  bucketDificultadCalendario,
  COLOR_DIFICULTAD_CALENDARIO,
  COLOR_DIFICULTAD_CALENDARIO_CAMPO,
  COLOR_REVALORIZACION_CAMPO,
} from "@/lib/formato";
import { COLUMNAS_OPCIONALES } from "@/lib/columnas";
import { LINEAS_ORDEN, type Formacion } from "@/lib/formacion";
import { accionEstablecerEstadoMiEquipo, accionEliminarDeMiEquipo } from "@/app/actions";

const CLAVES_PERMITIDAS = new Set<keyof Jugador>([
  "porcentajeTitularidad",
  "valorSinClausula",
  "diferenciaValor",
  "dificultadProximos5",
]);
const EXCLUIR_FILTROS = COLUMNAS_OPCIONALES.filter((c) => !CLAVES_PERMITIDAS.has(c.clave)).map((c) => c.clave);

const TAMANO_BOTON_AGREGAR = 52;

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
  onClickDificultad: (() => void) | undefined,
  enCampo: boolean
): { texto: string; color?: string; onClick?: () => void }[] {
  const lineas: { texto: string; color?: string; onClick?: () => void }[] = [];
  if (columnasVisibles.porcentajeTitularidad) {
    lineas.push({ texto: j.porcentajeTitularidad === null ? "—" : `${j.porcentajeTitularidad}%` });
  }
  if (columnasVisibles.valorSinClausula) {
    lineas.push({ texto: formatearValor(j.valorSinClausula) });
  }
  if (columnasVisibles.diferenciaValor) {
    const paletaRevalorizacion = enCampo
      ? COLOR_REVALORIZACION_CAMPO
      : { positivo: "#16A34A", negativo: "#FE4B44" };
    const color =
      j.diferenciaValor === null || j.diferenciaValor === 0
        ? undefined
        : j.diferenciaValor > 0
          ? paletaRevalorizacion.positivo
          : paletaRevalorizacion.negativo;
    lineas.push({ texto: formatearValor(j.diferenciaValor), color });
  }
  if (columnasVisibles.dificultadProximos5) {
    const bucket = bucketDificultadCalendario(j.dificultadProximos5);
    const paletaDificultad = enCampo ? COLOR_DIFICULTAD_CALENDARIO_CAMPO : COLOR_DIFICULTAD_CALENDARIO;
    lineas.push({
      texto: bucket ?? "—",
      color: bucket ? paletaDificultad[bucket] : undefined,
      onClick: onClickDificultad,
    });
  }
  return lineas;
}

export function MiEquipo({ jugadores, miClub }: { jugadores: Jugador[]; miClub: MiClub }) {
  const [columnasVisibles, setColumnasVisibles] = useState<ColumnasVisibles>({});
  const [buscador, setBuscador] = useState<EstadoMiEquipo | null>(null);
  const [menuJugador, setMenuJugador] = useState<Jugador | null>(null);
  const [modalPartidos, setModalPartidos] = useState<Jugador | null>(null);

  const titulares = jugadores.filter((j) => j.estadoMiEquipo === "titular");
  const suplentes = jugadores.filter((j) => j.estadoMiEquipo === "suplente");
  const enDuda = jugadores.filter((j) => j.estadoMiEquipo === "duda");
  const seguimiento = jugadores.filter((j) => j.estadoMiEquipo === "seguimiento");
  const idsAsignados = new Set(jugadores.filter((j) => j.estadoMiEquipo !== null).map((j) => j.id));

  const revalorizacion = [...titulares, ...suplentes].reduce((acc, j) => acc + (j.diferenciaValor ?? 0), 0);
  const valorEquipo = miClub.valorEquipo;
  const valorClub =
    miClub.valorEquipo !== null || miClub.dinero !== null ? (miClub.valorEquipo ?? 0) + (miClub.dinero ?? 0) : null;
  const colorRevalorizacion = revalorizacion > 0 ? "#16A34A" : revalorizacion < 0 ? "#FE4B44" : undefined;

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

  function lineasDe(j: Jugador, enCampo: boolean) {
    return lineasParaJugador(j, columnasVisibles, j.equipoId !== null ? () => setModalPartidos(j) : undefined, enCampo);
  }

  const datosPorJugador = Object.fromEntries(jugadores.map((j) => [j.id, lineasDe(j, false)]));
  const datosPorJugadorCampo = Object.fromEntries(jugadores.map((j) => [j.id, lineasDe(j, true)]));

  function abrirMenu(id: number) {
    const j = jugadores.find((x) => x.id === id);
    if (j) setMenuJugador(j);
  }

  async function establecer(id: number, estado: EstadoMiEquipo) {
    setMenuJugador(null);
    setBuscador(null);
    const resultado = await accionEstablecerEstadoMiEquipo(id, estado);
    if (!resultado.ok) {
      alert(resultado.motivo);
    }
  }

  async function eliminar(id: number) {
    setMenuJugador(null);
    await accionEliminarDeMiEquipo(id);
  }

  return (
    <div className="max-w-[1576px] mx-auto w-full px-6 sm:px-12 pt-14 pb-22 flex flex-col lg:flex-row items-center lg:items-start gap-14 lg:gap-20 text-center">
      <div className="flex flex-col items-center gap-14 w-full lg:w-[700px] lg:shrink-0">
        <div className="relative w-full">
          <CampoTactico formacion={formacion} datosPorJugador={datosPorJugadorCampo} onClickJugador={abrirMenu} />
          <div className="absolute top-4 right-4">
            <MenuFiltros columnas={columnasVisibles} onChangeColumnas={setColumnasVisibles} excluir={EXCLUIR_FILTROS} />
          </div>
          <div className="absolute bottom-4 left-4">
            <BotonAgregar
              size={TAMANO_BOTON_AGREGAR}
              onClick={() => setBuscador("titular")}
              className="bg-[#F5F5F7]"
            />
          </div>
        </div>

        <Banquillo
          jugadores={formacion.banquillo}
          mostrarAgregar
          onAgregar={() => setBuscador("suplente")}
          datosPorJugador={datosPorJugador}
          onClickJugador={abrirMenu}
        />
      </div>

      <div className="w-full lg:w-[700px] lg:shrink-0 flex flex-col gap-14">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
          <TarjetaEstadistica etiqueta="Valor de mi club" valor={formatearValor(valorClub)} />
          <TarjetaEstadistica etiqueta="Valor de mi equipo" valor={formatearValor(valorEquipo)} />
          <TarjetaEstadistica etiqueta="Revalorización" valor={formatearValor(revalorizacion)} color={colorRevalorizacion} />
          <TarjetaEstadistica etiqueta="Fichas de mi equipo" valor={miClub.fichas === null ? "—" : String(miClub.fichas)} />
        </div>

        <div className="w-full flex flex-col items-start gap-[18px]">
          <h2 className="text-[20px] font-bold">En duda</h2>
          <div className="w-full rounded-[18px] bg-white p-[18px] flex flex-wrap justify-start gap-[14px]">
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
                lineas={datosPorJugador[j.id]}
                onClick={() => abrirMenu(j.id)}
              />
            ))}
            <RanuraAgregar size={62} onClick={() => setBuscador("duda")} />
          </div>
        </div>

        <div className="w-full flex flex-col items-start gap-[18px]">
          <h2 className="text-[20px] font-bold">Seguimiento</h2>
          <div className="w-full rounded-[18px] bg-white p-[18px] flex flex-wrap justify-start gap-[14px]">
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
                lineas={datosPorJugador[j.id]}
                onClick={() => abrirMenu(j.id)}
              />
            ))}
            <RanuraAgregar size={62} onClick={() => setBuscador("seguimiento")} />
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
                  className="w-full text-left px-2 py-2 rounded-lg text-sm text-[#FE4B44] transition-colors duration-200 hover:bg-[#FAFAFC]"
                >
                  Eliminar
                </button>
              )}
            </div>
          </div>
        </div>
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
