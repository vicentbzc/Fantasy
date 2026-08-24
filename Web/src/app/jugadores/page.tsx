import { Suspense } from "react";
import { obtenerJugadores } from "@/lib/db";
import { Explorador } from "@/components/Explorador";

export const revalidate = 300;

export default async function Jugadores() {
  const jugadores = await obtenerJugadores();
  return (
    <Suspense>
      <Explorador jugadores={jugadores} />
    </Suspense>
  );
}
