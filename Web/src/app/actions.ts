"use server";

import { revalidatePath } from "next/cache";
import {
  obtenerHistorialValor,
  obtenerHistorialPuntos,
  obtenerEquipoDetalle,
  obtenerJugadoresEquipo,
  obtenerJugadores,
  establecerEstadoMiEquipo,
  eliminarDeMiEquipo,
  type EstadoMiEquipo,
} from "@/lib/db";
import { calcularFormacion } from "@/lib/formacion";
import { preguntarSobreJugadores, type MensajeChat } from "@/lib/ia";

export async function accionHistorialValor(id: number) {
  return obtenerHistorialValor(id);
}

export async function accionHistorialPuntos(id: number) {
  return obtenerHistorialPuntos(id);
}

export async function accionProximosPartidos(equipoId: number) {
  const equipo = await obtenerEquipoDetalle(equipoId);
  return {
    partidos: equipo?.partidos ?? [],
    jornadaLigaOrden: equipo?.jornadaLigaOrden ?? null,
  };
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
    jornadaLigaOrden: equipo.jornadaLigaOrden,
  };
}

export async function accionEstablecerEstadoMiEquipo(jugadorId: number, estado: EstadoMiEquipo) {
  const resultado = await establecerEstadoMiEquipo(jugadorId, estado);
  revalidatePath("/mi-equipo");
  revalidatePath("/jugadores");
  return resultado;
}

export async function accionEliminarDeMiEquipo(jugadorId: number) {
  await eliminarDeMiEquipo(jugadorId);
  revalidatePath("/mi-equipo");
  revalidatePath("/jugadores");
}

export async function accionPreguntarIA(pregunta: string, historial: MensajeChat[]) {
  const jugadores = await obtenerJugadores();
  return preguntarSobreJugadores(pregunta, historial, jugadores);
}
