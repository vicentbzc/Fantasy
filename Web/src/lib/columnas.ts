import type { Jugador } from "./db";
import { formatearEstado, bucketDificultadCalendario, formatearNumeroEs } from "./formato";

export type ColumnaOpcional = {
  clave: keyof Jugador;
  etiqueta: string;
  sufijo?: string;
  decimales?: number;
  tipo?: "texto";
  formatear?: (valor: unknown) => string;
};

export const COLUMNAS_OPCIONALES: ColumnaOpcional[] = [
  { clave: "equipo", etiqueta: "Equipo", tipo: "texto" },
  { clave: "posicion", etiqueta: "Posición", tipo: "texto" },
  { clave: "estado", etiqueta: "Estado", tipo: "texto", formatear: (v) => formatearEstado(v as string | null) },
  { clave: "porcentajeTitularidad", etiqueta: "Titularidad", sufijo: " %" },
  { clave: "valorSinClausula", etiqueta: "Valor" },
  { clave: "valor", etiqueta: "Valor en la liga" },
  { clave: "diferenciaValor", etiqueta: "Revalorización" },
  { clave: "porcentajeDiferencia", etiqueta: "Porcentaje de revalorización", sufijo: " %", decimales: 2 },
  {
    clave: "tendenciaDias",
    etiqueta: "Tendencia",
    formatear: (v) => {
      const n = v as number | null;
      if (n === null) return "—";
      return `${n} ${n === 1 ? "día" : "días"}`;
    },
  },
  { clave: "puntosUltimaJornada", etiqueta: "Puntos en la última jornada" },
  { clave: "puntosTotales", etiqueta: "Puntos totales" },
  {
    clave: "dificultadProximos5",
    etiqueta: "Dificultad del calendario",
    formatear: (v) => bucketDificultadCalendario(v as number | null) ?? "—",
  },
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
  { clave: "puntosDazn", etiqueta: "Puntos DAZN" },
];

export const CLAVES_SUMABLES = new Set<keyof Jugador>([
  "valorSinClausula",
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
  return formatearNumeroEs(valor, decimales);
}

export function formatearCelda(columna: ColumnaOpcional, valor: unknown): string {
  if (columna.formatear) return columna.formatear(valor);
  if (columna.tipo === "texto") return (valor as string | null) ?? "—";
  const numero = valor as number | null;
  if (numero === null) return "—";
  return `${formatearNumero(numero, columna.decimales ?? 0)}${columna.sufijo ?? ""}`;
}
