import type { JugadorProbable } from "@/lib/db";
import { urlFotoJugador } from "@/lib/imagenes";
import { FotoJugadorSlot } from "./FotoJugadorSlot";
import { BotonAgregar } from "./BotonAgregar";

export function Banquillo({
  jugadores,
  mostrarAgregar,
  onAgregar,
}: {
  jugadores: JugadorProbable[];
  mostrarAgregar?: boolean;
  onAgregar?: () => void;
}) {
  return (
    <div
      className="bg-white rounded-[24px] p-[22px] grid gap-[14px] justify-center w-full max-w-[700px] mx-auto"
      style={{ gridTemplateColumns: "repeat(5, 73px)" }}
    >
      {jugadores.map((jugador) => (
        <div key={jugador.id} className="flex justify-center">
          <FotoJugadorSlot
            src={urlFotoJugador(jugador.id)}
            alt={jugador.nombre}
            size={62}
            radius={12}
            probabilidad={jugador.probabilidad}
            colorProbabilidad="#6E6E73"
            fontSizeProbabilidad={14}
          />
        </div>
      ))}
      {mostrarAgregar && (
        <div className="flex flex-col items-center gap-1">
          <span className="text-[14px] font-bold leading-none opacity-0">+</span>
          <BotonAgregar size={62} onClick={onAgregar} />
        </div>
      )}
    </div>
  );
}
