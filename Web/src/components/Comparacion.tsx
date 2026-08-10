import type { Jugador } from "@/lib/db";
import { Avatar } from "./Avatar";
import { urlFotoJugador, urlEscudoEquipo } from "@/lib/imagenes";
import { formatearValor, formatearPorcentaje, formatearEstado } from "@/lib/formato";

export function Comparacion({
  jugadores,
  onQuitar,
}: {
  jugadores: Jugador[];
  onQuitar: (id: number) => void;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <h2 className="text-sm font-medium text-neutral-400 mb-4">Comparación</h2>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${jugadores.length}, minmax(0, 1fr))` }}
      >
        {jugadores.map((j) => (
          <div
            key={j.id}
            className="flex flex-col items-center gap-2 rounded-md bg-neutral-950 border border-neutral-800 p-4 relative"
          >
            <button
              onClick={() => onQuitar(j.id)}
              className="absolute top-2 right-2 text-neutral-500 hover:text-neutral-200 text-xs"
            >
              ✕
            </button>
            <Avatar src={urlFotoJugador(j.id)} alt={j.nombre} size={72} />
            <div className="text-center">
              <p className="font-medium">{j.nombre}</p>
              <div className="flex items-center justify-center gap-1 text-xs text-neutral-400">
                {j.equipoId !== null && (
                  <Avatar src={urlEscudoEquipo(j.equipoId)!} alt={j.equipo} size={14} />
                )}
                {j.equipo}
              </div>
            </div>
            <dl className="w-full text-sm mt-2 grid grid-cols-2 gap-y-1">
              <dt className="text-neutral-500">Valor</dt>
              <dd className="text-right tabular-nums">{formatearValor(j.valor)}</dd>
              <dt className="text-neutral-500">Puntos</dt>
              <dd className="text-right tabular-nums">{j.puntosTotales}</dd>
              <dt className="text-neutral-500">Titularidad</dt>
              <dd className="text-right tabular-nums">{formatearPorcentaje(j.porcentajeTitularidad)}</dd>
              <dt className="text-neutral-500">Minutos</dt>
              <dd className="text-right tabular-nums">{j.minutosJugados ?? "—"}</dd>
              <dt className="text-neutral-500">Estado</dt>
              <dd className="text-right">{formatearEstado(j.estado)}</dd>
              <dt className="text-neutral-500">Próximo rival</dt>
              <dd className="text-right">{j.proximoRival ?? "—"}</dd>
              <dt className="text-neutral-500">Dificultad</dt>
              <dd className="text-right">{j.proximaDificultad ?? "—"}</dd>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
