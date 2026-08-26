"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { accionDetallePartido } from "@/app/actions";
import { ImagenCuadrada } from "./ImagenCuadrada";
import { CampoTactico } from "./CampoTactico";
import { Banquillo } from "./Banquillo";
import { TarjetaProximoPartido } from "./TarjetaProximoPartido";
import { urlEscudoEquipo } from "@/lib/imagenes";
import { formatearCuando, COLOR_DIFICULTAD } from "@/lib/formato";
import { hrefsJugadores } from "@/lib/formacion";

type DetallePartido = Awaited<ReturnType<typeof accionDetallePartido>>;

export function ModalPartido({
  equipoId,
  orden,
  onClose,
  mostrarProximosPartidos = true,
}: {
  equipoId: number;
  orden: number;
  onClose: () => void;
  mostrarProximosPartidos?: boolean;
}) {
  const [ordenActual, setOrdenActual] = useState(orden);
  const [cargado, setCargado] = useState<{ orden: number; detalle: DetallePartido } | null>(null);

  useEffect(() => {
    let cancelado = false;
    accionDetallePartido(equipoId, ordenActual).then((resultado) => {
      if (!cancelado) setCargado({ orden: ordenActual, detalle: resultado });
    });
    return () => {
      cancelado = true;
    };
  }, [equipoId, ordenActual]);

  const detalle = cargado?.orden === ordenActual ? cargado.detalle : null;

  const cuando = detalle
    ? formatearCuando(detalle.partido.jornada, detalle.partido.dia, detalle.partido.hora, detalle.partido.localVisitante)
    : null;
  const colorDificultad = detalle?.partido.dificultad ? COLOR_DIFICULTAD[detalle.partido.dificultad] : null;
  const nombreRival = detalle ? detalle.partido.rivalNombreOficial ?? detalle.partido.rival ?? "Por confirmar" : null;
  const esVisitante = detalle?.partido.localVisitante === "Visitante";
  const local = detalle
    ? esVisitante
      ? { id: detalle.partido.rivalId, nombre: nombreRival! }
      : { id: detalle.equipoId, nombre: detalle.equipoNombre }
    : null;
  const visitante = detalle
    ? esVisitante
      ? { id: detalle.equipoId, nombre: detalle.equipoNombre }
      : { id: detalle.partido.rivalId, nombre: nombreRival! }
    : null;

  const hrefs = detalle
    ? hrefsJugadores([
        ...(detalle.formacion.portero ? [detalle.formacion.portero] : []),
        ...detalle.formacion.lineas.flat(),
        ...(detalle.formacion.posicionesReales ?? []),
        ...detalle.formacion.banquillo,
      ])
    : {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-[#F5F5F7] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end mb-2">
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">
            ✕
          </button>
        </div>

        {!detalle && <p className="text-sm text-neutral-500 text-center py-10">Cargando…</p>}

        {detalle && local && visitante && (
          <div className="flex flex-col items-center gap-8 text-center">
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-medium" style={{ color: "rgba(29,29,31,0.62)" }}>
                {cuando || "Por confirmar"}
              </p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-5 gap-y-2 w-full max-w-md">
                {local.id !== null ? (
                  <Link href={`/equipos/${local.id}`} className="text-[16px] font-semibold text-right justify-self-end w-fit hover:text-[#6E6E73]">
                    {local.nombre}
                  </Link>
                ) : (
                  <span className="text-[16px] font-semibold text-right">{local.nombre}</span>
                )}
                <div className="flex items-center gap-5">
                  <ImagenCuadrada src={urlEscudoEquipo(local.id)} alt={local.nombre} size={72} radius={16} bg="transparent" padding={12} />
                  <span className="text-base font-bold text-[#6E6E73]">VS</span>
                  <ImagenCuadrada
                    src={urlEscudoEquipo(visitante.id)}
                    alt={visitante.nombre}
                    size={72}
                    radius={16}
                    bg="transparent"
                    padding={12}
                  />
                </div>
                {visitante.id !== null ? (
                  <Link href={`/equipos/${visitante.id}`} className="text-[16px] font-semibold text-left justify-self-start w-fit hover:text-[#6E6E73]">
                    {visitante.nombre}
                  </Link>
                ) : (
                  <span className="text-[16px] font-semibold text-left">{visitante.nombre}</span>
                )}
              </div>
              {colorDificultad && (
                <p className="text-sm font-semibold" style={{ color: colorDificultad }}>
                  Dificultad {detalle.partido.dificultad!.toLowerCase()}
                </p>
              )}
            </div>

            <div className="w-full">
              <CampoTactico formacion={detalle.formacion} hrefsPorJugador={hrefs} />
            </div>

            <Banquillo jugadores={detalle.formacion.banquillo} hrefsPorJugador={hrefs} />

            {mostrarProximosPartidos && detalle.proximosPartidos.length > 0 && (
              <div className="w-full flex flex-col items-start gap-3 text-left">
                <h3 className="text-lg font-bold">Próximos partidos</h3>
                <div className="w-full flex flex-col gap-3">
                  {detalle.proximosPartidos.slice(0, 5).map((partido) => {
                    const clicable = partido.orden === detalle.jornadaLigaOrden;
                    return (
                      <div
                        key={partido.orden}
                        role={clicable ? "button" : undefined}
                        tabIndex={clicable ? 0 : undefined}
                        onClick={clicable ? () => setOrdenActual(partido.orden) : undefined}
                        className={clicable ? "cursor-pointer" : ""}
                      >
                        <TarjetaProximoPartido
                          partido={partido}
                          equipoId={detalle.equipoId}
                          equipoNombre={detalle.equipoNombre}
                          fondo="#FFFFFF"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
