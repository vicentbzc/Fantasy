import type { JugadorProbable } from "@/lib/db";
import { urlFotoJugador } from "@/lib/imagenes";
import { FotoJugadorSlot } from "./FotoJugadorSlot";
import { RanuraAgregar } from "./RanuraAgregar";

export function Banquillo({
  jugadores,
  mostrarAgregar,
  onAgregar,
  datosPorJugador,
  onClickJugador,
  tamanoAgregar = 62,
  hrefsPorJugador,
  fondo = "#FFFFFF",
}: {
  jugadores: JugadorProbable[];
  mostrarAgregar?: boolean;
  onAgregar?: () => void;
  datosPorJugador?: Record<number, { texto: string; color?: string }[]>;
  onClickJugador?: (id: number) => void;
  tamanoAgregar?: number;
  hrefsPorJugador?: Record<number, string>;
  fondo?: string;
}) {
  return (
    <div
      className="rounded-[24px] p-[28px] grid gap-[28px] w-full max-w-[700px] mx-auto"
      style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", backgroundColor: fondo }}
    >
      {jugadores.map((jugador) => (
        <div key={jugador.id} className="flex justify-center">
          <FotoJugadorSlot
            src={jugador.esFantasma ? null : urlFotoJugador(jugador.id)}
            alt={jugador.nombre}
            size={62}
            radius={12}
            probabilidad={jugador.probabilidad}
            colorProbabilidad="#6E6E73"
            fontSizeProbabilidad={14}
            lineas={datosPorJugador?.[jugador.id]}
            onClick={onClickJugador ? () => onClickJugador(jugador.id) : undefined}
            href={!jugador.esFantasma ? hrefsPorJugador?.[jugador.id] : undefined}
          />
        </div>
      ))}
      {mostrarAgregar && <RanuraAgregar size={tamanoAgregar} onClick={onAgregar} />}
    </div>
  );
}
