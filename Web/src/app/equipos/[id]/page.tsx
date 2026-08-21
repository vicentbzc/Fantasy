import { notFound } from "next/navigation";
import { obtenerEquipoDetalle, obtenerJugadoresEquipo } from "@/lib/db";
import { urlEscudoEquipo } from "@/lib/imagenes";
import { formatearCuando, COLOR_DIFICULTAD } from "@/lib/formato";
import { ImagenCuadrada } from "@/components/ImagenCuadrada";
import { CampoTactico } from "@/components/CampoTactico";
import { Banquillo } from "@/components/Banquillo";
import { TarjetaProximoPartido } from "@/components/TarjetaProximoPartido";
import { calcularFormacion } from "@/lib/formacion";

export const revalidate = 300;

export default async function EquipoDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const equipo = await obtenerEquipoDetalle(Number(id));
  if (!equipo) notFound();

  const jugadores = await obtenerJugadoresEquipo(equipo.nombre);
  const formacion = calcularFormacion(jugadores);

  const subtituloCuando = formatearCuando(
    null,
    equipo.diaJornadaLiga,
    equipo.horaJornadaLiga,
    equipo.localVisitanteJornadaLiga
  );
  const colorDificultad = equipo.dificultadJornadaLiga ? COLOR_DIFICULTAD[equipo.dificultadJornadaLiga] : null;
  const nombreDisplay = equipo.nombreOficial ?? equipo.nombre;
  const rivalDisplay = equipo.rivalJornadaLigaNombreOficial ?? equipo.rivalJornadaLiga;

  return (
    <div className="max-w-[700px] mx-auto w-full px-6 pt-14 pb-22 flex flex-col items-center gap-14 text-center">
      <div className="flex flex-col items-center gap-6 w-full">
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
            <span className="text-[16px] font-semibold text-right">{nombreDisplay}</span>
            <div className="flex items-center gap-5">
              <ImagenCuadrada
                src={urlEscudoEquipo(equipo.id)}
                alt={nombreDisplay}
                size={104}
                radius={18}
                bg="transparent"
                padding={18}
              />
              <span className="text-base font-bold text-[#6E6E73]">VS</span>
              <ImagenCuadrada
                src={urlEscudoEquipo(equipo.rivalJornadaLigaId)}
                alt={rivalDisplay ?? ""}
                size={104}
                radius={18}
                bg="transparent"
                padding={18}
              />
            </div>
            <span className="text-[16px] font-semibold text-left">{rivalDisplay}</span>
          </div>
        )}

        {equipo.dificultadJornadaLiga && (
          <p className="text-sm font-semibold" style={{ color: colorDificultad ?? undefined }}>
            Dificultad {equipo.dificultadJornadaLiga.toLowerCase()}
          </p>
        )}

        <CampoTactico formacion={formacion} />

        <Banquillo jugadores={formacion.banquillo} />
      </div>

      <div className="w-full flex flex-col items-start gap-[18px]">
        <h2 className="text-[32px] font-bold" style={{ letterSpacing: "-1px" }}>
          Próximos partidos
        </h2>
        <div className="w-full rounded-[28px] bg-white p-[28px] flex flex-col gap-[18px]">
          {equipo.partidos.map((partido) => (
            <TarjetaProximoPartido
              key={partido.orden}
              partido={partido}
              equipoId={equipo.id}
              equipoNombre={nombreDisplay}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
