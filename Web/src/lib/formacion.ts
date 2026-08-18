import type { JugadorProbable } from "./db";

export type JugadorPosicionado = JugadorProbable & { posX: number; posY: number };

export type Formacion = {
  portero: JugadorProbable | null;
  lineas: JugadorProbable[][];
  posicionesReales: JugadorPosicionado[] | null;
  banquillo: JugadorProbable[];
};

const LINEAS_ORDEN = ["Defensa", "Mediocampista", "Delantero"];
const TAMANO_BANQUILLO = 10;
const MINIMO_OUTFIELD_CON_POSICION_REAL = 8;

function comparar(a: JugadorProbable, b: JugadorProbable) {
  if (b.probabilidad !== a.probabilidad) return b.probabilidad - a.probabilidad;
  return a.nombre.localeCompare(b.nombre, "es");
}

function tienePosicionReal(j: JugadorProbable): j is JugadorPosicionado {
  return j.posX !== null && j.posY !== null;
}

export function calcularFormacion(jugadores: JugadorProbable[]): Formacion {
  const conPosicion = jugadores.filter(tienePosicionReal);
  const porteroReal = conPosicion.find((j) => j.posicion === "Portero") ?? null;
  const outfieldReal = conPosicion.filter((j) => j.posicion !== "Portero").sort(comparar).slice(0, 10);

  if (porteroReal && outfieldReal.length >= MINIMO_OUTFIELD_CON_POSICION_REAL) {
    const titularesIds = new Set([porteroReal.id, ...outfieldReal.map((j) => j.id)]);
    const banquillo = jugadores
      .filter((j) => !titularesIds.has(j.id))
      .sort(comparar)
      .slice(0, TAMANO_BANQUILLO);

    return {
      portero: porteroReal,
      lineas: [],
      posicionesReales: [porteroReal, ...outfieldReal],
      banquillo,
    };
  }

  const porteros = jugadores.filter((j) => j.posicion === "Portero").sort(comparar);
  const resto = jugadores.filter((j) => j.posicion !== "Portero").sort(comparar);

  const portero = porteros[0] ?? null;
  const outfield = resto.slice(0, 10);

  const titularesIds = new Set(outfield.map((j) => j.id));
  if (portero) titularesIds.add(portero.id);

  const lineas = LINEAS_ORDEN.map((posicion) => outfield.filter((j) => j.posicion === posicion)).filter(
    (linea) => linea.length > 0
  );

  const banquillo = jugadores
    .filter((j) => !titularesIds.has(j.id))
    .sort(comparar)
    .slice(0, TAMANO_BANQUILLO);

  return { portero, lineas, posicionesReales: null, banquillo };
}
