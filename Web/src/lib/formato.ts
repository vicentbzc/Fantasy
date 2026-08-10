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
