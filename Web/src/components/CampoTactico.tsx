import type { Formacion } from "@/lib/formacion";
import { urlFotoJugador } from "@/lib/imagenes";
import { FotoJugadorSlot } from "./FotoJugadorSlot";

export function CampoTactico({ formacion }: { formacion: Formacion }) {
  const filas = formacion.lineas;

  return (
    <div
      className="relative w-full max-w-[700px] mx-auto rounded-[36px] overflow-hidden p-6 flex flex-col justify-between gap-6"
      style={{
        aspectRatio: "700 / 980",
        background: "linear-gradient(135deg, #5B9D70 0%, #3E8055 100%)",
      }}
    >
      <div className="absolute inset-x-0 top-1/2 border-t border-white/80 pointer-events-none" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[180px] h-[180px] rounded-full border border-white/80 pointer-events-none" />

      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[380px] h-[150px] border border-white/80 border-b-0 pointer-events-none" />
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[220px] h-[54px] border border-white/80 border-b-0 pointer-events-none" />
      <div
        className="absolute left-1/2 -translate-x-1/2 border border-white/80 border-b-0 pointer-events-none"
        style={{ bottom: 150, width: 120, height: 60, borderRadius: "120px 120px 0 0" }}
      />

      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[380px] h-[150px] border border-white/80 border-t-0 pointer-events-none" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[220px] h-[54px] border border-white/80 border-t-0 pointer-events-none" />
      <div
        className="absolute left-1/2 -translate-x-1/2 border border-white/80 border-t-0 pointer-events-none"
        style={{ top: 150, width: 120, height: 60, borderRadius: "0 0 120px 120px" }}
      />

      {formacion.posicionesReales ? (
        formacion.posicionesReales.map((jugador) => (
          <div
            key={jugador.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${jugador.posX}%`, top: `${100 - jugador.posY}%` }}
          >
            <FotoJugadorSlot
              src={jugador.esFantasma ? null : urlFotoJugador(jugador.id)}
              alt={jugador.nombre}
              size={62}
              radius={14}
              probabilidad={jugador.probabilidad}
              colorProbabilidad="#FFFFFF"
              fontSizeProbabilidad={14}
              colorNombre="#FFFFFF"
            />
          </div>
        ))
      ) : (
        <>
          <div className="relative flex justify-center">
            {formacion.portero && (
              <FotoJugadorSlot
                src={urlFotoJugador(formacion.portero.id)}
                alt={formacion.portero.nombre}
                size={62}
                radius={14}
                probabilidad={formacion.portero.probabilidad}
                colorProbabilidad="#FFFFFF"
                fontSizeProbabilidad={14}
                colorNombre="#FFFFFF"
              />
            )}
          </div>

          {filas.map((linea, i) => (
            <div key={i} className="relative flex justify-around items-start">
              {linea.map((jugador) => (
                <FotoJugadorSlot
                  key={jugador.id}
                  src={urlFotoJugador(jugador.id)}
                  alt={jugador.nombre}
                  size={62}
                  radius={14}
                  probabilidad={jugador.probabilidad}
                  colorProbabilidad="#FFFFFF"
                  fontSizeProbabilidad={14}
                  colorNombre="#FFFFFF"
                />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
