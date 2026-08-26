const URL_BASE_STORAGE = "https://wsmfnigtenshzrctkfcj.supabase.co/storage/v1/object/public/imagenes";

function cortaCache(): string {
  return new Date().toISOString().slice(0, 10);
}

export function urlFotoJugador(id: number): string {
  return `${URL_BASE_STORAGE}/jugadores/${id}.png?v=${cortaCache()}`;
}

export function urlEscudoEquipo(id: number | null): string | null {
  if (id === null) return null;
  return `${URL_BASE_STORAGE}/equipos/${id}.png?v=${cortaCache()}`;
}

export function urlLogoCompeticion(competicion: string | null): string | null {
  if (competicion === "LaLiga") return "/laliga.png";
  if (competicion === "Conference League") return "/conference-league.png";
  return null;
}

export const SIN_FOTO = "/sin-foto.png";
