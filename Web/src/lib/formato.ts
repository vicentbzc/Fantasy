export function formatearValor(valor: number | null): string {
  if (valor === null) return "—";
  return valor.toLocaleString("es-ES");
}

export function formatearPorcentaje(valor: number | null): string {
  if (valor === null) return "—";
  return `${valor.toLocaleString("es-ES")}%`;
}

export function formatearEstado(estado: string | null): string {
  if (!estado) return "Disponible";
  return estado;
}

export function formatearLocalVisitante(valor: "Local" | "Visitante" | null): string | null {
  if (valor === "Local") return "en casa";
  if (valor === "Visitante") return "de visitante";
  return null;
}

export function minusculaInicial(texto: string): string {
  return texto.length ? texto.charAt(0).toLowerCase() + texto.slice(1) : texto;
}

export const COLOR_DIFICULTAD: Record<string, string> = {
  "Muy alta": "#DC2626",
  Alta: "#EA580C",
  Media: "#CA8A04",
  Baja: "#2563EB",
  "Muy baja": "#16A34A",
};

export function formatearCuando(
  prefijo: string | null,
  dia: string | null,
  hora: string | null,
  localVisitante: "Local" | "Visitante" | null
): string {
  const fechaHora = [dia, hora].filter(Boolean).join(" a las ");
  const localVisitanteTexto = formatearLocalVisitante(localVisitante);
  const cuerpo = [fechaHora, localVisitanteTexto].filter(Boolean).join(" ");

  if (!prefijo) return cuerpo;
  if (!cuerpo) return prefijo;
  return `${prefijo}, ${minusculaInicial(cuerpo)}`;
}
