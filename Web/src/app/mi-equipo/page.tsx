import { obtenerJugadores, obtenerMiClub } from "@/lib/db";
import { MiEquipo } from "@/components/MiEquipo";

export const dynamic = "force-dynamic";

export default async function MiEquipoPage() {
  const [jugadores, miClub] = await Promise.all([obtenerJugadores(), obtenerMiClub()]);

  return <MiEquipo jugadores={jugadores} miClub={miClub} />;
}
