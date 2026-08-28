import type { JugadorProbable } from "@/lib/db";
import { urlFotoJugador } from "@/lib/imagenes";
import { FotoJugadorSlot } from "./FotoJugadorSlot";
import { RanuraAgregar } from "./RanuraAgregar";

// Mismos valores que CampoTactico para que campo y banquillo salgan del mismo
// tamaño. En escritorio equivalen a los de siempre; en móvil no bajan del
// mínimo legible.
const DIM_FOTO = "min(62px, calc(8.8571cqw * 1.2))";
const RADIO_FOTO = "min(12px, 2.5cqw)";
const TAM_TEXTO = "max(11px, 2cqw)";
const TAM_NOMBRE = "max(10px, 1.5714cqw)";

export function Banquillo({
  jugadores,
  mostrarAgregar,
  onAgregar,
  datosPorJugador,
  onClickJugador,
  tamanoAgregar = DIM_FOTO,
  hrefsPorJugador,
  fondo = "#FFFFFF",
}: {
  jugadores: JugadorProbable[];
  mostrarAgregar?: boolean;
  onAgregar?: () => void;
  datosPorJugador?: Record<number, { texto: string; color?: string }[]>;
  onClickJugador?: (id: number) => void;
  tamanoAgregar?: number | string;
  hrefsPorJugador?: Record<number, string>;
  fondo?: string;
}) {
  return (
    <div className="w-full max-w-[700px] mx-auto" style={{ containerType: "inline-size" }}>
      <div
        className="rounded-[24px] max-sm:rounded-[16px] p-[28px] max-sm:p-3 grid gap-[28px] max-sm:gap-2.5 w-full"
        style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", backgroundColor: fondo }}
      >
        {jugadores.map((jugador) => (
          <div key={jugador.id} className="flex justify-center">
            <FotoJugadorSlot
              src={jugador.esFantasma ? null : urlFotoJugador(jugador.id)}
              alt={jugador.nombre}
              size={DIM_FOTO}
              radius={RADIO_FOTO}
              probabilidad={jugador.probabilidad}
              colorProbabilidad="#6E6E73"
              fontSizeProbabilidad={TAM_TEXTO}
              fontSizeNombre={TAM_NOMBRE}
              lineas={datosPorJugador?.[jugador.id]}
              onClick={onClickJugador ? () => onClickJugador(jugador.id) : undefined}
              href={!jugador.esFantasma ? hrefsPorJugador?.[jugador.id] : undefined}
            />
          </div>
        ))}
        {mostrarAgregar && <RanuraAgregar size={tamanoAgregar} onClick={onAgregar} />}
      </div>
    </div>
  );
}
