import type { JugadorProbable } from "@/lib/db";
import { urlFotoJugador } from "@/lib/imagenes";
import { FotoJugadorSlot } from "./FotoJugadorSlot";
import { BotonAgregar } from "./BotonAgregar";

export function Banquillo({
  jugadores,
  mostrarAgregar,
  onAgregar,
  datosPorJugador,
  onClickJugador,
}: {
  jugadores: JugadorProbable[];
  mostrarAgregar?: boolean;
  onAgregar?: () => void;
  datosPorJugador?: Record<number, { texto: string; color?: string }[]>;
  onClickJugador?: (id: number) => void;
}) {
  return (
    <div
      className="bg-white rounded-[24px] p-[28px] grid gap-[28px] w-full max-w-[700px] mx-auto"
      style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
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
          />
        </div>
      ))}
      {mostrarAgregar && (
        <div className="flex flex-col items-center gap-1">
          <span className="text-[14px] font-bold leading-none opacity-0">+</span>
          <BotonAgregar size={62} onClick={onAgregar} className="bg-[#F5F5F7]" />
        </div>
      )}
    </div>
  );
}
