import type { Jugador } from "./db";

export type Operador = ">" | "<" | "=";

export type ColumnaNumerica = {
  clave: keyof Jugador;
  etiqueta: string;
  sufijo?: string;
  decimales?: number;
};

export const COLUMNAS_NUMERICAS: ColumnaNumerica[] = [
  { clave: "porcentajeTitularidad", etiqueta: "Porcentaje de titularidad", sufijo: "%" },
  { clave: "valor", etiqueta: "Valor" },
  { clave: "diferenciaValor", etiqueta: "Diferencia de valor" },
  { clave: "porcentajeDiferencia", etiqueta: "Porcentaje de diferencia", sufijo: "%", decimales: 2 },
  { clave: "tendenciaDias", etiqueta: "Tendencia" },
  { clave: "puntosUltimaJornada", etiqueta: "Puntos última jornada" },
  { clave: "puntosTotales", etiqueta: "Puntos totales" },
  { clave: "dificultadProximos5", etiqueta: "Dificultad del calendario", decimales: 1 },
  { clave: "minutosJugados", etiqueta: "Minutos jugados" },
  { clave: "goles", etiqueta: "Goles" },
  { clave: "asistenciasGol", etiqueta: "Asistencias de gol" },
  { clave: "asistenciasSinGol", etiqueta: "Asistencias sin gol" },
  { clave: "balonesArea", etiqueta: "Balones al área" },
  { clave: "penaltisProvocados", etiqueta: "Penaltis provocados" },
  { clave: "penaltisCometidos", etiqueta: "Penaltis cometidos" },
  { clave: "penaltisParados", etiqueta: "Penaltis parados" },
  { clave: "paradas", etiqueta: "Paradas" },
  { clave: "despejes", etiqueta: "Despejes" },
  { clave: "penaltisFallados", etiqueta: "Penaltis fallados" },
  { clave: "golesPropiaPuerta", etiqueta: "Goles en propia puerta" },
  { clave: "golesEnContra", etiqueta: "Goles en contra" },
  { clave: "tarjetasAmarillas", etiqueta: "Tarjetas amarillas" },
  { clave: "tarjetasRojas", etiqueta: "Tarjetas rojas" },
  { clave: "tirosPuerta", etiqueta: "Tiros a puerta" },
  { clave: "regates", etiqueta: "Regates" },
  { clave: "balonesRecuperados", etiqueta: "Balones recuperados" },
  { clave: "posesionesPerdidas", etiqueta: "Posesiones perdidas" },
  { clave: "puntosDazn", etiqueta: "Puntos DAZN", decimales: 1 },
  { clave: "tarjetasAmarillasAcumuladas", etiqueta: "Amarillas acumuladas" },
  { clave: "segundasAmarillas", etiqueta: "Segundas amarillas" },
];

export const CLAVES_SUMABLES = new Set<keyof Jugador>([
  "valor",
  "diferenciaValor",
  "minutosJugados",
  "puntosUltimaJornada",
  "puntosTotales",
  "goles",
  "asistenciasGol",
  "asistenciasSinGol",
  "balonesArea",
  "penaltisProvocados",
  "penaltisCometidos",
  "penaltisParados",
  "paradas",
  "despejes",
  "penaltisFallados",
  "golesPropiaPuerta",
  "golesEnContra",
  "tarjetasAmarillas",
  "segundasAmarillas",
  "tarjetasRojas",
  "tirosPuerta",
  "regates",
  "balonesRecuperados",
  "posesionesPerdidas",
  "puntosDazn",
]);

export const OPCIONES_ACELERACION = [
  "Acelera mucho",
  "Acelera",
  "Estable",
  "Desacelera",
  "Desacelera mucho",
  "Inflexión positiva",
  "Inflexión negativa",
];

export function formatearNumero(valor: number | null, decimales = 0): string {
  if (valor === null) return "—";
  return valor.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

export function cumpleFiltroNumerico(valor: number | null, operador: Operador, referencia: number): boolean {
  if (valor === null) return false;
  if (operador === ">") return valor > referencia;
  if (operador === "<") return valor < referencia;
  return valor === referencia;
}
