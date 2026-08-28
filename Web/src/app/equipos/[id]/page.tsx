import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerEquipoDetalle, obtenerJugadoresEquipo } from "@/lib/db";
import { formatearCuando, COLOR_DIFICULTAD } from "@/lib/formato";
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

  const subtituloCuando = formatearCuando(null, equipo.diaJornadaLiga, equipo.horaJornadaLiga, equipo.localVisitanteJornadaLiga);
  const colorDificultad = equipo.dificultadJornadaLiga ? COLOR_DIFICULTAD[equipo.dificultadJornadaLiga] : null;

  const encabezado = (
    <div className="flex flex-col items-start gap-2">
      <h1 className="text-[32px] font-bold text-left" style={{ letterSpacing: "-1px" }}>
        Posible alineación{equipo.jornadaLiga ? ` de la jornada ${equipo.jornadaLiga}` : ""}
        {equipo.rivalJornadaLiga && (
          <>
            , <Link href={`/equipos/${equipo.id}`} className="hover:text-[#6E6E73]">{nombreDisplay}</Link> contra{" "}
            {equipo.rivalJornadaLigaId !== null ? (
              <Link href={`/equipos/${equipo.rivalJornadaLigaId}`} className="hover:text-[#6E6E73]">
                {rivalDisplay}
              </Link>
            ) : (
              rivalDisplay
            )}
          </>
        )}
      </h1>
      {subtituloCuando && (
        <p className="text-sm font-medium text-left" style={{ color: "rgba(29,29,31,0.62)" }}>
          {subtituloCuando}
        </p>
      )}
      {equipo.dificultadJornadaLiga && (
        <p className="text-sm font-medium text-left" style={{ color: colorDificultad ?? undefined }}>
          Dificultad {equipo.dificultadJornadaLiga.toLowerCase()}
        </p>
      )}
    </div>
  );

  return (
    <div className="max-w-[1576px] mx-auto w-full px-6 sm:px-12 pt-14 pb-22 flex flex-col lg:flex-row items-center lg:items-stretch gap-14 lg:gap-20">
      {/* Encabezado: solo en móvil, como primer elemento encima del campo */}
      <div className="w-full lg:hidden">{encabezado}</div>

      <div className="flex flex-col items-center gap-14 w-full lg:w-[700px] lg:shrink-0">
        <div className="relative w-full">
          <CampoTactico formacion={formacion} hrefsPorJugador={hrefs} />
        </div>

        <Banquillo jugadores={formacion.banquillo} hrefsPorJugador={hrefs} />
      </div>

      <div className="w-full lg:w-[700px] lg:shrink-0 text-left flex flex-col justify-between">
        {/* Encabezado: en escritorio va aquí, en la columna derecha */}
        <div className="hidden lg:block">{encabezado}</div>

        <div className="w-full flex flex-col items-start gap-[18px]">
          <h2 className="text-[32px] font-bold text-left" style={{ letterSpacing: "-1px" }}>
            Próximos partidos
          </h2>

          <ListaProximosPartidos
            partidos={proximosPartidos}
            equipoId={equipo.id}
            equipoNombre={nombreDisplay}
            fondoTarjeta="#FFFFFF"
            jornadaLigaOrden={equipo.jornadaLigaOrden}
          />
        </div>
      </div>
    </div>
  );
}
