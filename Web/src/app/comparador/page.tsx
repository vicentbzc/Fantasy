import { obtenerJugadores } from "@/lib/db";
import { Comparador } from "@/components/Comparador";

export const revalidate = 300;

export default async function ComparadorPage() {
  const jugadores = await obtenerJugadores();
  return <Comparador jugadores={jugadores} />;
}
