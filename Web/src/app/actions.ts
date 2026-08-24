"use server";

import { revalidatePath } from "next/cache";
import {
  obtenerHistorialValor,
  obtenerHistorialPuntos,
  obtenerEquipoDetalle,
  establecerEstadoMiEquipo,
  eliminarDeMiEquipo,
  type EstadoMiEquipo,
} from "@/lib/db";

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

export async function accionEstablecerEstadoMiEquipo(jugadorId: number, estado: EstadoMiEquipo) {
  const resultado = await establecerEstadoMiEquipo(jugadorId, estado);
  revalidatePath("/mi-equipo");
  return resultado;
}

export async function accionEliminarDeMiEquipo(jugadorId: number) {
  await eliminarDeMiEquipo(jugadorId);
  revalidatePath("/mi-equipo");
}
