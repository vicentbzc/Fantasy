import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerEquipoDetalle, obtenerJugadoresEquipo } from "@/lib/db";
import { urlEscudoEquipo } from "@/lib/imagenes";
import { formatearCuando, COLOR_DIFICULTAD } from "@/lib/formato";
import { ImagenCuadrada } from "@/components/ImagenCuadrada";
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

  const subtituloCuando = formatearCuando(
    null,
    equipo.diaJornadaLiga,
    equipo.horaJornadaLiga,
    equipo.localVisitanteJornadaLiga
  );
  const colorDificultad = equipo.dificultadJornadaLiga ? COLOR_DIFICULTAD[equipo.dificultadJornadaLiga] : null;
  const nombreDisplay = equipo.nombreOficial ?? equipo.nombre;
  const rivalDisplay = equipo.rivalJornadaLigaNombreOficial ?? equipo.rivalJornadaLiga;
  const proximosPartidos = equipo.partidos.filter((partido) => partido.orden !== equipo.jornadaLigaOrden);

  return (
    <div className="max-w-[1576px] mx-auto w-full px-6 sm:px-12 pt-14 pb-22 flex flex-col lg:flex-row items-center lg:items-start gap-14 lg:gap-20">
      <div className="flex flex-col items-center gap-6 w-full lg:w-[700px] lg:shrink-0 text-center">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-[32px] font-bold" style={{ letterSpacing: "-1px" }}>
            Posible alineación{equipo.jornadaLiga ? ` de la jornada ${equipo.jornadaLiga}` : ""}
          </h1>
          {subtituloCuando && (
            <p className="text-sm font-medium" style={{ color: "rgba(29,29,31,0.62)" }}>
              {subtituloCuando}
            </p>
          )}
        </div>

        {equipo.rivalJornadaLiga && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-5 gap-y-2 w-full">
            <Link href={`/equipos/${equipo.id}`} className="text-[16px] font-semibold text-right hover:opacity-70">
              {nombreDisplay}
            </Link>
            <div className="flex items-center gap-5">
              <Link href={`/equipos/${equipo.id}`}>
                <ImagenCuadrada
                  src={urlEscudoEquipo(equipo.id)}
                  alt={nombreDisplay}
                  size={104}
                  radius={18}
                  bg="transparent"
                  padding={18}
                />
              </Link>
              <span className="text-base font-bold text-[#6E6E73]">VS</span>
              {equipo.rivalJornadaLigaId !== null ? (
                <Link href={`/equipos/${equipo.rivalJornadaLigaId}`}>
                  <ImagenCuadrada
                    src={urlEscudoEquipo(equipo.rivalJornadaLigaId)}
                    alt={rivalDisplay ?? ""}
                    size={104}
                    radius={18}
                    bg="transparent"
                    padding={18}
                  />
                </Link>
              ) : (
                <ImagenCuadrada
                  src={urlEscudoEquipo(equipo.rivalJornadaLigaId)}
                  alt={rivalDisplay ?? ""}
                  size={104}
                  radius={18}
                  bg="transparent"
                  padding={18}
                />
              )}
            </div>
            {equipo.rivalJornadaLigaId !== null ? (
              <Link
                href={`/equipos/${equipo.rivalJornadaLigaId}`}
                className="text-[16px] font-semibold text-left hover:opacity-70"
              >
                {rivalDisplay}
              </Link>
            ) : (
              <span className="text-[16px] font-semibold text-left">{rivalDisplay}</span>
            )}
          </div>
        )}

        {equipo.dificultadJornadaLiga && (
          <p className="text-sm font-semibold" style={{ color: colorDificultad ?? undefined }}>
            Dificultad {equipo.dificultadJornadaLiga.toLowerCase()}
          </p>
        )}

        <CampoTactico formacion={formacion} hrefsPorJugador={hrefs} />

        <Banquillo jugadores={formacion.banquillo} hrefsPorJugador={hrefs} />
      </div>

      <div className="w-full lg:w-[700px] lg:shrink-0 flex flex-col items-start gap-[18px]">
        <h2 className="text-[32px] font-bold" style={{ letterSpacing: "-1px" }}>
          Próximos partidos
        </h2>
        <div className="w-full rounded-[28px] bg-white p-[28px] flex flex-col gap-[18px]">
          <ListaProximosPartidos partidos={proximosPartidos} equipoId={equipo.id} equipoNombre={nombreDisplay} />
        </div>
      </div>
    </div>
  );
}
