import { obtenerJugadores, type Jugador, type JugadorProbable } from "@/lib/db";
import { calcularFormacion } from "@/lib/formacion";
import { CampoTactico } from "@/components/CampoTactico";
import { Banquillo } from "@/components/Banquillo";
import { BotonAgregar } from "@/components/BotonAgregar";
import { TarjetaEstadistica } from "@/components/TarjetaEstadistica";
import { FotoJugadorSlot } from "@/components/FotoJugadorSlot";
import { urlFotoJugador } from "@/lib/imagenes";
import { formatearValor } from "@/lib/formato";

export const revalidate = 300;

const TAMANO_PLANTILLA = 25;

function aProbable(j: Jugador): JugadorProbable {
  return {
    id: j.id,
    nombre: j.nombre,
    posicion: j.posicion,
    probabilidad: j.porcentajeTitularidad,
    posX: null,
    posY: null,
  };
}

export default async function MiEquipo() {
  const jugadores = await obtenerJugadores();
  const porValor = [...jugadores].sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));

  const porteros = porValor.filter((j) => j.posicion === "Portero").slice(0, 3);
  const resto = porValor.filter((j) => j.posicion !== "Portero").slice(0, TAMANO_PLANTILLA - porteros.length);
  const plantilla = [...porteros, ...resto];
  const idsPlantilla = new Set(plantilla.map((j) => j.id));

  const formacion = calcularFormacion(plantilla.map(aProbable));
  const titulares = [formacion.portero, ...formacion.lineas.flat()].filter(
    (j): j is JugadorProbable => j !== null
  );
  const porId = new Map(plantilla.map((j) => [j.id, j]));

  const valorEquipo = titulares.reduce((acc, j) => acc + (porId.get(j.id)?.valor ?? 0), 0);
  const valorBanquillo = formacion.banquillo.reduce((acc, j) => acc + (porId.get(j.id)?.valor ?? 0), 0);
  const revalorizacion = titulares.reduce((acc, j) => acc + (porId.get(j.id)?.diferenciaValor ?? 0), 0);
  const fichas = titulares.length + formacion.banquillo.length;
  const colorRevalorizacion = revalorizacion > 0 ? "#16A34A" : revalorizacion < 0 ? "#DC2626" : undefined;

  const enDuda = plantilla.filter((j) => j.estado && j.estado !== "Disponible para competir").slice(0, 3);
  const seguido = porValor.find((j) => !idsPlantilla.has(j.id)) ?? null;

  return (
    <div className="max-w-[700px] mx-auto w-full px-6 pt-14 pb-22 flex flex-col items-center gap-14 text-center">
      <div className="grid grid-cols-2 gap-3 w-full">
        <TarjetaEstadistica
          etiqueta="Revalorización"
          valor={formatearValor(revalorizacion)}
          color={colorRevalorizacion}
        />
        <TarjetaEstadistica etiqueta="Valor de mi equipo" valor={formatearValor(valorEquipo)} />
        <TarjetaEstadistica etiqueta="Valor de mi club" valor={formatearValor(valorEquipo + valorBanquillo)} />
        <TarjetaEstadistica etiqueta="Fichas de mi equipo" valor={String(fichas)} />
      </div>

      <div className="relative w-full">
        <CampoTactico formacion={formacion} />
        <button
          type="button"
          className="absolute top-4 right-4 bg-white rounded-[14px] px-4 py-2 text-sm text-neutral-500 flex items-center gap-2 transition-colors duration-200 hover:bg-[#FAFAFC]"
        >
          Filtros
          <span className="text-neutral-400 text-xs">▾</span>
        </button>
        <div className="absolute bottom-4 left-4">
          <BotonAgregar size={40} />
        </div>
      </div>

      <Banquillo jugadores={formacion.banquillo} mostrarAgregar />

      <div className="w-full flex flex-col items-start gap-[18px]">
        <h2 className="text-[20px] font-bold">En duda</h2>
        <div className="w-full rounded-[18px] bg-white p-[18px] flex flex-wrap justify-start gap-[14px]">
          {enDuda.length === 0 && <p className="text-sm text-neutral-400">Nadie en duda ahora mismo.</p>}
          {enDuda.map((j) => (
            <FotoJugadorSlot
              key={j.id}
              src={urlFotoJugador(j.id)}
              alt={j.nombre}
              size={62}
              radius={12}
              probabilidad={j.porcentajeTitularidad}
              colorProbabilidad="#6E6E73"
              fontSizeProbabilidad={14}
            />
          ))}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-bold leading-none opacity-0">+</span>
            <BotonAgregar size={62} />
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col items-start gap-[18px]">
        <h2 className="text-[20px] font-bold">Seguimiento</h2>
        <div className="w-full rounded-[18px] bg-white p-[18px] flex flex-wrap justify-start gap-[14px]">
          {seguido && (
            <FotoJugadorSlot
              src={urlFotoJugador(seguido.id)}
              alt={seguido.nombre}
              size={62}
              radius={12}
              probabilidad={seguido.porcentajeTitularidad}
              colorProbabilidad="#6E6E73"
              fontSizeProbabilidad={14}
            />
          )}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-bold leading-none opacity-0">+</span>
            <BotonAgregar size={62} />
          </div>
        </div>
      </div>
    </div>
  );
}
