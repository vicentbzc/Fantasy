"use server";

import { obtenerHistorialValor, obtenerHistorialPuntos } from "@/lib/db";

export async function accionHistorialValor(id: number) {
  return obtenerHistorialValor(id);
}

export async function accionHistorialPuntos(id: number) {
  return obtenerHistorialPuntos(id);
}
