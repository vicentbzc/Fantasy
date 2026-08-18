const URL_BASE_STORAGE = "https://wsmfnigtenshzrctkfcj.supabase.co/storage/v1/object/public/imagenes";

export function urlFotoJugador(id: number): string {
  return `${URL_BASE_STORAGE}/jugadores/${id}.png`;
}

export function urlEscudoEquipo(id: number | null): string | null {
  if (id === null) return null;
  return `${URL_BASE_STORAGE}/equipos/${id}.png`;
}

export function urlLogoCompeticion(competicion: string | null): string | null {
  if (competicion === "LaLiga") return "/laliga.png";
  return null;
}

export const SIN_FOTO = "/sin-foto.png";
