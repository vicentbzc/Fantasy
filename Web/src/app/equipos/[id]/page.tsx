import { notFound } from "next/navigation";
import { obtenerEquipoDetalle, obtenerJugadoresEquipo } from "@/lib/db";
import { formatearCuando } from "@/lib/formato";
import { CampoTactico } from "@/components/CampoTactico";
import { Banquillo } from "@/components/Banquillo";
import { ListaProximosPartidos } from "@/components/ListaProximosPartidos";
import { calcularFormacion, hrefsJugadores } from "@/lib/formacion";

export const revalidate = 300;

export default async function EquipoDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const equipo = await obtenerEquipoDetalle(Number(id));
  if (!equipo) notFound();

  const jugadores = await obtenerJugadoresEquipo(equipo.nombre);
  const formacion = calcularFormacion(jugadores);
  const hrefs = hrefsJugadores(jugadores);

  const nombreDisplay = equipo.nombreOficial ?? equipo.nombre;
  const rivalDisplay = equipo.rivalJornadaLigaNombreOficial ?? equipo.rivalJornadaLiga;
  const proximosPartidos = equipo.partidos.filter((partido) => partido.orden !== equipo.jornadaLigaOrden);

  const subtituloCuando = formatearCuando(
    equipo.dificultadJornadaLiga ? `Dificultad ${equipo.dificultadJornadaLiga.toLowerCase()}` : null,
    equipo.diaJornadaLiga,
    equipo.horaJornadaLiga,
    equipo.localVisitanteJornadaLiga
  );

  return (
    <div className="max-w-[1576px] mx-auto w-full px-6 sm:px-12 pt-14 pb-22 flex flex-col lg:flex-row items-center lg:items-start gap-14 lg:gap-20">
      <div className="flex flex-col items-center gap-14 w-full lg:w-[700px] lg:shrink-0">
        <div className="relative w-full">
          <CampoTactico formacion={formacion} hrefsPorJugador={hrefs} />
        </div>

        <Banquillo jugadores={formacion.banquillo} hrefsPorJugador={hrefs} />
      </div>

      <div className="w-full lg:w-[700px] lg:shrink-0 flex flex-col items-start gap-[18px] text-left">
        <div className="flex flex-col items-start gap-2">
          <h1 className="text-[32px] font-bold text-left" style={{ letterSpacing: "-1px" }}>
            Posible alineación{equipo.jornadaLiga ? ` de la jornada ${equipo.jornadaLiga}` : ""}
            {equipo.rivalJornadaLiga ? `, ${nombreDisplay} contra ${rivalDisplay}` : ""}
          </h1>
          {subtituloCuando && (
            <p className="text-sm font-medium text-left" style={{ color: "rgba(29,29,31,0.62)" }}>
              {subtituloCuando}
            </p>
          )}
        </div>

        <ListaProximosPartidos
          partidos={proximosPartidos}
          equipoId={equipo.id}
          equipoNombre={nombreDisplay}
          fondoTarjeta="#FFFFFF"
        />
      </div>
    </div>
  );
}
