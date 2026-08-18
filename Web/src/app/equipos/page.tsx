import Link from "next/link";
import { obtenerEquipos } from "@/lib/db";
import { urlEscudoEquipo } from "@/lib/imagenes";
import { TarjetaEquipo } from "@/components/TarjetaEquipo";

export const revalidate = 300;

export default async function Equipos() {
  const equipos = await obtenerEquipos();

  return (
    <div className="max-w-[1200px] mx-auto w-full px-6 sm:px-12 pb-16 pt-12">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-7">
        {equipos.map((equipo) =>
          equipo.id !== null ? (
            <Link key={equipo.nombre} href={`/equipos/${equipo.id}`}>
              <TarjetaEquipo nombre={equipo.nombreOficial ?? equipo.nombre} src={urlEscudoEquipo(equipo.id)} />
            </Link>
          ) : (
            <TarjetaEquipo key={equipo.nombre} nombre={equipo.nombreOficial ?? equipo.nombre} src={null} />
          )
        )}
      </div>
    </div>
  );
}
