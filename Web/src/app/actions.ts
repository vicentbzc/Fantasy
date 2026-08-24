"use server";

import { revalidatePath } from "next/cache";
import {
  obtenerHistorialValor,
  obtenerHistorialPuntos,
  obtenerEquipoDetalle,
  obtenerJugadoresEquipo,
  establecerEstadoMiEquipo,
  eliminarDeMiEquipo,
  type EstadoMiEquipo,
} from "@/lib/db";
import { calcularFormacion } from "@/lib/formacion";

export async function accionHistorialValor(id: number) {
  return obtenerHistorialValor(id);
}

export async function accionHistorialPuntos(id: number) {
  return obtenerHistorialPuntos(id);
}

export async function accionProximosPartidos(equipoId: number) {
  const equipo = await obtenerEquipoDetalle(equipoId);
  return equipo?.partidos ?? [];
}

export async function accionDetallePartido(equipoId: number, orden: number) {
  const equipo = await obtenerEquipoDetalle(equipoId);
  const partido = equipo?.partidos.find((p) => p.orden === orden) ?? null;
  if (!equipo || !partido) return null;

  const jugadores = await obtenerJugadoresEquipo(equipo.nombre);

  return {
    equipoId: equipo.id,
    equipoNombre: equipo.nombreOficial ?? equipo.nombre,
    partido,
    formacion: calcularFormacion(jugadores),
    proximosPartidos: equipo.partidos.filter((p) => p.orden !== orden),
  };
}

export async function accionEstablecerEstadoMiEquipo(jugadorId: number, estado: EstadoMiEquipo) {
  const resultado = await establecerEstadoMiEquipo(jugadorId, estado);
  revalidatePath("/mi-equipo");
  return resultado;
}

export async function accionEliminarDeMiEquipo(jugadorId: number) {
  await eliminarDeMiEquipo(jugadorId);
  revalidatePath("/mi-equipo");
}
