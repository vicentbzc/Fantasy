import type { Jugador } from "./db";

export const OPCIONES_ACELERACION = [
  "Acelera mucho",
  "Acelera",
  "Estable",
  "Desacelera",
  "Desacelera mucho",
  "Inflexión positiva",
  "Inflexión negativa",
];

export type ColumnaOpcional = {
  clave: keyof Jugador;
  etiqueta: string;
  sufijo?: string;
  decimales?: number;
  tipo?: "texto";
  ordenTexto?: string[];
};

export const COLUMNAS_OPCIONALES: ColumnaOpcional[] = [
  { clave: "porcentajeTitularidad", etiqueta: "Titularidad", sufijo: "%" },
  { clave: "valor", etiqueta: "Valor" },
  { clave: "diferenciaValor", etiqueta: "Revalorización" },
  { clave: "porcentajeDiferencia", etiqueta: "Porcentaje de revalorización", sufijo: "%", decimales: 2 },
  { clave: "aceleracion", etiqueta: "Aceleración", tipo: "texto", ordenTexto: OPCIONES_ACELERACION },
  { clave: "tendenciaDias", etiqueta: "Tendencia" },
  { clave: "puntosUltimaJornada", etiqueta: "Puntos en la última jornada" },
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
  "tarjetasRojas",
  "tirosPuerta",
  "regates",
  "balonesRecuperados",
  "posesionesPerdidas",
  "puntosDazn",
]);

export function formatearNumero(valor: number | null, decimales = 0): string {
  if (valor === null) return "—";
  return valor.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

export function formatearCelda(columna: ColumnaOpcional, valor: unknown): string {
  if (columna.tipo === "texto") return (valor as string | null) ?? "—";
  return `${formatearNumero(valor as number | null, columna.decimales ?? 0)}${columna.sufijo ?? ""}`;
}
