import { Suspense } from "react";
import { obtenerJugadores } from "@/lib/db";
import { Explorador } from "@/components/Explorador";

export const dynamic = "force-dynamic";

export default async function Jugadores() {
  const jugadores = await obtenerJugadores();
  return (
    <Suspense>
      <Explorador jugadores={jugadores} />
    </Suspense>
  );
}
