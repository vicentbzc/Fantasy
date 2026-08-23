"use server";

import { obtenerHistorialValor, obtenerHistorialPuntos, obtenerEquipoDetalle } from "@/lib/db";

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
