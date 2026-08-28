import type { Formacion } from "@/lib/formacion";
import { urlFotoJugador } from "@/lib/imagenes";
import { FotoJugadorSlot } from "./FotoJugadorSlot";

// El campo se diseña sobre una anchura de referencia de 700px. Todas las
// medidas internas (líneas, fotos, textos, márgenes) se expresan en `cqw`
// respecto al contenedor: 1px de diseño = 100/700 cqw ≈ 0.142857cqw. Así el
// campo entero se escala proporcionalmente. En escritorio el contenedor mide
// 700px, con lo que cada valor equivale a su px original (idéntico a antes).
const A = 100 / 700; // cqw por px de diseño
const cqw = (px: number) => `${(px * A).toFixed(4)}cqw`;

// Fotos y textos de los jugadores: en escritorio (contenedor 700px, o el modal
// ~624px) mantienen su tamaño de siempre; en móvil no bajan de un mínimo
// legible, así que la foto sale algo más grande que el escalado puro y el
// texto no se vuelve ilegible. Mismo valor en campo y banquillo → igual tamaño.
const TAM_FOTO = "min(62px, calc(8.8571cqw * 1.2))";
const RADIO_FOTO = "max(9px, 2cqw)";
const TAM_TEXTO = "max(11px, 2cqw)";
const TAM_NOMBRE = "max(10px, 1.5714cqw)";

export function CampoTactico({
  formacion,
  datosPorJugador,
  onClickJugador,
  hrefsPorJugador,
  oscuro,
}: {
  formacion: Formacion;
  datosPorJugador?: Record<number, { texto: string; color?: string }[]>;
  onClickJugador?: (id: number) => void;
  hrefsPorJugador?: Record<number, string>;
  oscuro?: boolean;
}) {
  const filas = formacion.lineas;
  const claseLinea = oscuro ? "border-white/45" : "border-white/55";

  return (
    <div className="w-full max-w-[700px] mx-auto" style={{ containerType: "inline-size" }}>
      <div
        className="relative overflow-hidden flex flex-col justify-between"
        style={{
          width: "100cqw",
          aspectRatio: "700 / 980",
          borderRadius: cqw(36),
          padding: cqw(24),
          paddingTop: cqw(40),
          paddingBottom: cqw(140),
          gap: cqw(24),
          background: oscuro ? "#194C2B" : "#3BB568",
        }}
      >
        <div className={`absolute inset-x-0 top-1/2 border-t ${claseLinea} pointer-events-none`} />
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${claseLinea} pointer-events-none`}
          style={{ width: cqw(180), height: cqw(180) }}
        />

        <div
          className={`absolute left-1/2 bottom-0 -translate-x-1/2 border ${claseLinea} border-b-0 pointer-events-none`}
          style={{ width: cqw(380), height: cqw(150) }}
        />
        <div
          className={`absolute left-1/2 bottom-0 -translate-x-1/2 border ${claseLinea} border-b-0 pointer-events-none`}
          style={{ width: cqw(220), height: cqw(54) }}
        />
        <div
          className={`absolute left-1/2 -translate-x-1/2 border ${claseLinea} border-b-0 pointer-events-none`}
          style={{ bottom: cqw(150), width: cqw(120), height: cqw(60), borderRadius: `${cqw(120)} ${cqw(120)} 0 0` }}
        />

        <div
          className={`absolute left-1/2 top-0 -translate-x-1/2 border ${claseLinea} border-t-0 pointer-events-none`}
          style={{ width: cqw(380), height: cqw(150) }}
        />
        <div
          className={`absolute left-1/2 top-0 -translate-x-1/2 border ${claseLinea} border-t-0 pointer-events-none`}
          style={{ width: cqw(220), height: cqw(54) }}
        />
        <div
          className={`absolute left-1/2 -translate-x-1/2 border ${claseLinea} border-t-0 pointer-events-none`}
          style={{ top: cqw(150), width: cqw(120), height: cqw(60), borderRadius: `0 0 ${cqw(120)} ${cqw(120)}` }}
        />

        <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(120,120,120,0.28)", backdropFilter: "blur(2px)" }} />

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
                size={TAM_FOTO}
                radius={RADIO_FOTO}
                probabilidad={jugador.probabilidad}
                colorProbabilidad="#FFFFFF"
                fontSizeProbabilidad={TAM_TEXTO}
                colorNombre="#FFFFFF"
                fontSizeNombre={TAM_NOMBRE}
                lineas={datosPorJugador?.[jugador.id]}
                onClick={onClickJugador ? () => onClickJugador(jugador.id) : undefined}
                href={!jugador.esFantasma ? hrefsPorJugador?.[jugador.id] : undefined}
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
                  size={TAM_FOTO}
                  radius={RADIO_FOTO}
                  probabilidad={formacion.portero.probabilidad}
                  colorProbabilidad="#FFFFFF"
                  fontSizeProbabilidad={TAM_TEXTO}
                  colorNombre="#FFFFFF"
                  fontSizeNombre={TAM_NOMBRE}
                  lineas={datosPorJugador?.[formacion.portero.id]}
                  onClick={onClickJugador ? () => onClickJugador(formacion.portero!.id) : undefined}
                  href={hrefsPorJugador?.[formacion.portero.id]}
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
                    size={TAM_FOTO}
                    radius={RADIO_FOTO}
                    probabilidad={jugador.probabilidad}
                    colorProbabilidad="#FFFFFF"
                    fontSizeProbabilidad={TAM_TEXTO}
                    colorNombre="#FFFFFF"
                    fontSizeNombre={TAM_NOMBRE}
                    lineas={datosPorJugador?.[jugador.id]}
                    onClick={onClickJugador ? () => onClickJugador(jugador.id) : undefined}
                    href={hrefsPorJugador?.[jugador.id]}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
