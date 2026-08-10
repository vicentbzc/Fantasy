import { obtenerJugadores } from "@/lib/db";
import { Explorador } from "@/components/Explorador";

export const revalidate = 300;

export default async function Home() {
  const jugadores = await obtenerJugadores();
  return <Explorador jugadores={jugadores} />;
}
