"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Jugador, MiClub, EstadoMiEquipo, JugadorProbable } from "@/lib/db";
import { CampoTactico } from "./CampoTactico";
import { BotonAgregar } from "./BotonAgregar";
import { RanuraAgregar } from "./RanuraAgregar";
import { TarjetaEstadistica } from "./TarjetaEstadistica";
import { FotoJugadorSlot } from "./FotoJugadorSlot";
import { BuscadorJugador } from "./BuscadorJugador";
import { ProximosPartidos } from "./ProximosPartidos";
import { MenuFiltros, type ColumnasVisibles } from "./MenuFiltros";
import { urlFotoJugador } from "@/lib/imagenes";
import { formatearValor, COLOR_DIFICULTAD, COLOR_REVALORIZACION_CAMPO } from "@/lib/formato";
import { FlechaAceleracion } from "./FlechaAceleracion";
import { COLUMNAS_OPCIONALES } from "@/lib/columnas";
import { LINEAS_ORDEN, type Formacion } from "@/lib/formacion";
import {
  accionEstablecerEstadoMiEquipo,
  accionEliminarDeMiEquipo,
  accionReordenarMiEquipo,
} from "@/app/actions";

const CLAVES_PERMITIDAS = new Set<keyof Jugador>([
  "porcentajeTitularidad",
  "valorSinClausula",
  "valor",
  "diferenciaValor",
  "proximoRival",
]);
const EXCLUIR_FILTROS = COLUMNAS_OPCIONALES.filter((c) => !CLAVES_PERMITIDAS.has(c.clave)).map((c) => c.clave);

const TAMANO_BOTON_AGREGAR = 52;

const ESTADOS: EstadoMiEquipo[] = ["titular", "suplente", "duda", "seguimiento"];
const CAJAS: { estado: EstadoMiEquipo; titulo: string }[] = [
  { estado: "suplente", titulo: "Suplentes" },
  { estado: "duda", titulo: "En duda" },
  { estado: "seguimiento", titulo: "Seguimiento" },
];

type Estados = Record<EstadoMiEquipo, number[]>;

function aProbable(j: Jugador): JugadorProbable {
  return { id: j.id, nombre: j.nombre, posicion: j.posicion, probabilidad: j.porcentajeTitularidad, posX: null, posY: null };
}

function lineasParaJugador(
  j: Jugador,
  columnasVisibles: ColumnasVisibles,
  onClickDificultad: (() => void) | undefined,
  enCampo: boolean
): { texto: string; color?: string; onClick?: () => void; sufijo?: ReactNode; wrap?: boolean }[] {
  const lineas: { texto: string; color?: string; onClick?: () => void; sufijo?: ReactNode; wrap?: boolean }[] = [];
  if (columnasVisibles.porcentajeTitularidad) {
    lineas.push({ texto: j.porcentajeTitularidad === null ? "—" : `${j.porcentajeTitularidad} %` });
  }
  if (columnasVisibles.valorSinClausula) {
    lineas.push({ texto: formatearValor(j.valorSinClausula) });
  }
  if (columnasVisibles.valor) {
    lineas.push({ texto: formatearValor(j.valor) });
  }
  if (columnasVisibles.diferenciaValor) {
    const paletaRevalorizacion = enCampo
      ? COLOR_REVALORIZACION_CAMPO
      : { positivo: "#3BB568", negativo: "#FE645F" };
    const color =
      j.diferenciaValor === null || j.diferenciaValor === 0
        ? undefined
        : j.diferenciaValor > 0
          ? paletaRevalorizacion.positivo
          : paletaRevalorizacion.negativo;
    lineas.push({
      texto: formatearValor(j.diferenciaValor),
      color,
      sufijo: <FlechaAceleracion aceleracion={j.aceleracion} className="ml-0.5" />,
    });
  }
  if (columnasVisibles.proximoRival) {
    const nombreRival = j.proximoRivalNombreOficial ?? j.proximoRival;
    lineas.push({
      texto: nombreRival ?? "—",
      color: j.proximaDificultad ? COLOR_DIFICULTAD[j.proximaDificultad] : undefined,
      onClick: nombreRival ? onClickDificultad : undefined,
      wrap: true,
    });
  }
  return lineas;
}

function derivarEstados(jugadores: Jugador[]): Estados {
  const base: Estados = { titular: [], suplente: [], duda: [], seguimiento: [] };
  for (const estado of ESTADOS) {
    base[estado] = jugadores
      .filter((j) => j.estadoMiEquipo === estado)
      .sort((a, b) => (a.ordenMiEquipo ?? 0) - (b.ordenMiEquipo ?? 0))
      .map((j) => j.id);
  }
  return base;
}

function aplicarReglaPortero(estados: Estados, recienMovido: number, porId: Map<number, Jugador>): Estados {
  const porterosTitulares = estados.titular.filter((id) => porId.get(id)?.posicion === "Portero");
  if (porterosTitulares.length <= 1) return estados;
  const mantener = porterosTitulares.includes(recienMovido)
    ? recienMovido
    : porterosTitulares[porterosTitulares.length - 1];
  const demotar = porterosTitulares.filter((id) => id !== mantener);
  return {
    ...estados,
    titular: estados.titular.filter((id) => !demotar.includes(id)),
    suplente: [...estados.suplente, ...demotar],
  };
}

function SlotArrastrable({ id, children }: { id: number; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        touchAction: "manipulation",
      }}
    >
      {children}
    </div>
  );
}

export function MiEquipo({ jugadores, miClub }: { jugadores: Jugador[]; miClub: MiClub }) {
  const [columnasVisibles, setColumnasVisibles] = useState<ColumnasVisibles>({});
  const [buscador, setBuscador] = useState<EstadoMiEquipo | null>(null);
  const [menuJugador, setMenuJugador] = useState<Jugador | null>(null);
  const [modalPartidos, setModalPartidos] = useState<Jugador | null>(null);
  const [activo, setActivo] = useState<number | null>(null);
  const [override, setOverride] = useState<Estados | null>(null);

  const porId = useMemo(() => new Map(jugadores.map((j) => [j.id, j])), [jugadores]);
  const firma = jugadores
    .filter((j) => j.estadoMiEquipo !== null)
    .map((j) => `${j.id}:${j.estadoMiEquipo}:${j.ordenMiEquipo}`)
    .join("|");
  const derivado = useMemo(() => derivarEstados(jugadores), [firma]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setOverride(null);
  }, [firma]);

  const estados = override ?? derivado;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const revalorizacion = miClub.revalorizacion;
  const valorEquipo = miClub.valorEquipo;
  const valorClub =
    miClub.valorEquipo !== null || miClub.dinero !== null ? (miClub.valorEquipo ?? 0) + (miClub.dinero ?? 0) : null;
  const colorRevalorizacion =
    revalorizacion === null ? undefined : revalorizacion > 0 ? "#3BB568" : revalorizacion < 0 ? "#FE645F" : undefined;

  const titulares = estados.titular.map((id) => porId.get(id)).filter((j): j is Jugador => j !== undefined);
  const idsAsignados = new Set([...estados.titular, ...estados.suplente, ...estados.duda, ...estados.seguimiento]);

  const porteroTitular = titulares.find((j) => j.posicion === "Portero") ?? null;
  const outfieldTitulares = titulares.filter((j) => j.posicion !== "Portero");
  const lineasCampo = LINEAS_ORDEN.map((pos) => outfieldTitulares.filter((j) => j.posicion === pos).map(aProbable)).filter(
    (l) => l.length > 0
  );
  const formacion: Formacion = {
    portero: porteroTitular ? aProbable(porteroTitular) : null,
    lineas: lineasCampo,
    posicionesReales: null,
    banquillo: [],
  };

  function lineasDe(j: Jugador, enCampo: boolean) {
    return lineasParaJugador(j, columnasVisibles, j.equipoId !== null ? () => setModalPartidos(j) : undefined, enCampo);
  }

  const datosPorJugador = Object.fromEntries(jugadores.map((j) => [j.id, lineasDe(j, false)]));
  const datosPorJugadorCampo = Object.fromEntries(jugadores.map((j) => [j.id, lineasDe(j, true)]));

  function abrirMenu(id: number) {
    const j = porId.get(id);
    if (j) setMenuJugador(j);
  }

  function contenedorDe(id: string | number): EstadoMiEquipo | null {
    if (typeof id === "string") return (ESTADOS as string[]).includes(id) ? (id as EstadoMiEquipo) : null;
    return ESTADOS.find((e) => estados[e].includes(id)) ?? null;
  }

  async function guardar(e: Estados) {
    await accionReordenarMiEquipo(ESTADOS.map((estado) => ({ estado, ids: e[estado] })));
  }

  function onDragStart(evento: DragStartEvent) {
    setActivo(Number(evento.active.id));
  }

  function onDragOver(evento: DragOverEvent) {
    const { active, over } = evento;
    if (!over) return;
    const origen = contenedorDe(active.id);
    const destino = contenedorDe(over.id);
    if (!origen || !destino || origen === destino) return;

    setOverride((prev) => {
      const p = prev ?? derivado;
      const idActivo = Number(active.id);
      const listaOrigen = p[origen].filter((x) => x !== idActivo);
      const listaDestino = [...p[destino]];
      const indice = typeof over.id === "number" ? listaDestino.indexOf(Number(over.id)) : -1;
      listaDestino.splice(indice < 0 ? listaDestino.length : indice, 0, idActivo);
      return { ...p, [origen]: listaOrigen, [destino]: listaDestino };
    });
  }

  function onDragEnd(evento: DragEndEvent) {
    const { active, over } = evento;
    setActivo(null);
    if (!over) {
      setOverride(null);
      return;
    }

    const idActivo = Number(active.id);
    const origen = contenedorDe(active.id);
    const destino = contenedorDe(over.id) ?? origen;
    if (!origen || !destino) {
      setOverride(null);
      return;
    }

    let p = override ?? derivado;
    if (origen === destino && typeof over.id === "number" && idActivo !== Number(over.id)) {
      const lista = p[destino];
      const desde = lista.indexOf(idActivo);
      const hasta = lista.indexOf(Number(over.id));
      if (desde !== -1 && hasta !== -1) {
        p = { ...p, [destino]: arrayMove(lista, desde, hasta) };
      }
    }
    p = aplicarReglaPortero(p, idActivo, porId);
    setOverride(p);
    guardar(p);
  }

  async function establecer(id: number, estado: EstadoMiEquipo) {
    setMenuJugador(null);
    setBuscador(null);
    const resultado = await accionEstablecerEstadoMiEquipo(id, estado);
    if (!resultado.ok) alert(resultado.motivo);
  }

  async function eliminar(id: number) {
    setMenuJugador(null);
    setOverride((prev) => {
      const p = prev ?? derivado;
      return Object.fromEntries(ESTADOS.map((e) => [e, p[e].filter((x) => x !== id)])) as Estados;
    });
    await accionEliminarDeMiEquipo(id);
  }

  const jugadorActivo = activo !== null ? porId.get(activo) : undefined;

  return (
    <DndContext
      id="mi-equipo"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActivo(null);
        setOverride(null);
      }}
    >
      <div className="max-w-[1576px] mx-auto w-full px-6 sm:px-12 pt-14 pb-22 flex flex-col lg:flex-row items-center lg:items-start gap-14 lg:gap-20 text-center">
        <div className="flex flex-col items-center gap-14 w-full lg:w-[700px] lg:shrink-0">
          <ZonaCampo estado="titular" ids={estados.titular}>
            <div className="relative w-full">
              <CampoTactico
                formacion={formacion}
                datosPorJugador={datosPorJugadorCampo}
                onClickJugador={abrirMenu}
                oscuro={columnasVisibles.diferenciaValor || columnasVisibles.proximoRival}
                envolverJugador={(id, contenido) => <SlotArrastrable id={id}>{contenido}</SlotArrastrable>}
              />
              <div className="absolute top-4 right-4 max-sm:top-2.5 max-sm:right-2.5">
                <MenuFiltros
                  columnas={columnasVisibles}
                  onChangeColumnas={setColumnasVisibles}
                  excluir={EXCLUIR_FILTROS}
                  className="w-[180px] max-sm:h-9 max-sm:w-[104px] max-sm:px-2.5 max-sm:text-xs max-sm:rounded-[8px]"
                />
              </div>
              <div className="absolute bottom-4 left-4 max-sm:bottom-2.5 max-sm:left-2.5">
                <BotonAgregar
                  size={TAMANO_BOTON_AGREGAR}
                  onClick={() => setBuscador("titular")}
                  className="bg-[#F5F5F7]/30 text-white hover:bg-[#F5F5F7]/20 max-sm:!h-9 max-sm:!w-9 max-sm:!text-base max-sm:rounded-[8px]"
                />
              </div>
            </div>
          </ZonaCampo>
        </div>

        <div className="w-full lg:w-[700px] lg:shrink-0 flex flex-col gap-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-6 w-full max-lg:order-last">
            <TarjetaEstadistica etiqueta="Valor de mi club" valor={formatearValor(valorClub)} />
            <TarjetaEstadistica etiqueta="Valor de mi equipo" valor={formatearValor(valorEquipo)} />
            <TarjetaEstadistica etiqueta="Revalorización de mi equipo" valor={formatearValor(revalorizacion)} color={colorRevalorizacion} />
            <TarjetaEstadistica etiqueta="Fichas de mi equipo" valor={miClub.fichas === null ? "—" : String(miClub.fichas)} />
          </div>

          {CAJAS.map(({ estado, titulo }) => (
            <div key={estado} className="w-full flex flex-col items-start gap-[18px]">
              <h2 className="text-[20px] font-bold">{titulo}</h2>
              <CajaSoltable
                estado={estado}
                ids={estados[estado]}
                porId={porId}
                datosPorJugador={datosPorJugador}
                onClickJugador={abrirMenu}
                onAgregar={() => setBuscador(estado)}
              />
            </div>
          ))}
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
              <p className="font-semibold text-sm mb-2 px-2 text-left">{menuJugador.nombre}</p>
              <p className="text-xs text-neutral-500 px-2 mb-3 text-left">
                Arrastra al jugador entre el campo y las cajas para cambiarlo de sitio.
              </p>
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => eliminar(menuJugador.id)}
                  className="w-full text-left px-2 py-2 rounded-lg text-sm text-[#FE645F] transition-colors duration-200 hover:bg-[#FAFAFC]"
                >
                  Eliminar
                </button>
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

      <DragOverlay dropAnimation={null}>
        {jugadorActivo && (
          <FotoJugadorSlot
            src={urlFotoJugador(jugadorActivo.id)}
            alt={jugadorActivo.nombre}
            size={62}
            radius={12}
            probabilidad={jugadorActivo.porcentajeTitularidad}
            colorProbabilidad="#6E6E73"
            fontSizeProbabilidad={14}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

function ZonaCampo({ estado, ids, children }: { estado: EstadoMiEquipo; ids: number[]; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: estado });
  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`w-full rounded-[36px] transition-shadow ${isOver ? "ring-2 ring-[#FE8B87]" : ""}`}
      >
        {children}
      </div>
    </SortableContext>
  );
}

function CajaSoltable({
  estado,
  ids,
  porId,
  datosPorJugador,
  onClickJugador,
  onAgregar,
}: {
  estado: EstadoMiEquipo;
  ids: number[];
  porId: Map<number, Jugador>;
  datosPorJugador: Record<number, { texto: string; color?: string; onClick?: () => void; wrap?: boolean }[]>;
  onClickJugador: (id: number) => void;
  onAgregar: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: estado });
  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`w-full rounded-[18px] bg-white p-[18px] sm:px-7 flex flex-wrap justify-start gap-x-5 gap-y-3.5 sm:gap-x-11 sm:gap-y-6 transition-shadow ${
          isOver ? "ring-2 ring-[#FE8B87]" : ""
        }`}
      >
        {ids.map((id) => {
          const j = porId.get(id);
          if (!j) return null;
          return (
            <SlotArrastrable key={id} id={id}>
              <FotoJugadorSlot
                src={urlFotoJugador(j.id)}
                alt={j.nombre}
                size={62}
                radius={12}
                probabilidad={j.porcentajeTitularidad}
                colorProbabilidad="#6E6E73"
                fontSizeProbabilidad={14}
                lineas={datosPorJugador[j.id]}
                onClick={() => onClickJugador(j.id)}
              />
            </SlotArrastrable>
          );
        })}
        <RanuraAgregar size={62} onClick={onAgregar} />
      </div>
    </SortableContext>
  );
}
