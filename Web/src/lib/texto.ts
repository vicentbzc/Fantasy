const RANGO_DIACRITICOS = /[̀-ͯ]/g;

export function normalizarTexto(texto: string): string {
  return texto.normalize("NFKD").replace(RANGO_DIACRITICOS, "").toLowerCase();
}
