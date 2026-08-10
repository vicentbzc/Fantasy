"use client";

import { useMemo, useState } from "react";
import type { Jugador } from "@/lib/db";
import { Avatar } from "./Avatar";
import { Comparacion } from "./Comparacion";
import { urlFotoJugador, urlEscudoEquipo } from "@/lib/imagenes";
import { formatearValor, formatearEstado } from "@/lib/formato";

const POSICIONES = ["Portero", "Defensa", "Mediocampista", "Delantero"];

type Orden = "valor" | "puntos" | "nombre";

export function Explorador({ jugadores }: { jugadores: Jugador[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [posicion, setPosicion] = useState("");
  const [equipo, setEquipo] = useState("");
  const [orden, setOrden] = useState<Orden>("valor");
  const [seleccionados, setSeleccionados] = useState<number[]>([]);

  const equipos = useMemo(
    () => Array.from(new Set(jugadores.map((j) => j.equipo))).sort(),
    [jugadores]
  );

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const resultado = jugadores.filter((j) => {
      if (texto && !j.nombre.toLowerCase().includes(texto)) return false;
      if (posicion && j.posicion !== posicion) return false;
      if (equipo && j.equipo !== equipo) return false;
      return true;
    });

    return resultado.sort((a, b) => {
      if (orden === "nombre") return a.nombre.localeCompare(b.nombre);
      if (orden === "puntos") return b.puntosTotales - a.puntosTotales;
      return (b.valor ?? 0) - (a.valor ?? 0);
    });
  }, [jugadores, busqueda, posicion, equipo, orden]);

  function alternarSeleccion(id: number) {
    setSeleccionados((actual) => {
      if (actual.includes(id)) return actual.filter((x) => x !== id);
      if (actual.length >= 3) return actual;
      return [...actual, id];
    });
  }

  const jugadoresSeleccionados = jugadores.filter((j) => seleccionados.includes(j.id));

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
      <header>
        <h1 className="text-2xl font-semibold">Fantasy LaLiga</h1>
        <p className="text-neutral-400 text-sm">
          {jugadores.length} jugadores · selecciona hasta 3 para comparar
        </p>
      </header>

      {jugadoresSeleccionados.length >= 2 && (
        <Comparacion jugadores={jugadoresSeleccionados} onQuitar={alternarSeleccion} />
      )}

      <div className="flex flex-wrap gap-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar jugador..."
          className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <select
          value={posicion}
          onChange={(e) => setPosicion(e.target.value)}
          className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm"
        >
          <option value="">Todas las posiciones</option>
          {POSICIONES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={equipo}
          onChange={(e) => setEquipo(e.target.value)}
          className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm"
        >
          <option value="">Todos los equipos</option>
          {equipos.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value as Orden)}
          className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm"
        >
          <option value="valor">Ordenar por valor</option>
          <option value="puntos">Ordenar por puntos</option>
          <option value="nombre">Ordenar por nombre</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400 text-left">
            <tr>
              <th className="p-3 w-10"></th>
              <th className="p-3">Jugador</th>
              <th className="p-3">Equipo</th>
              <th className="p-3">Posición</th>
              <th className="p-3 text-right">Valor</th>
              <th className="p-3 text-right">Puntos</th>
              <th className="p-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((j) => {
              const marcado = seleccionados.includes(j.id);
              const deshabilitado = !marcado && seleccionados.length >= 3;
              return (
                <tr
                  key={j.id}
                  onClick={() => !deshabilitado && alternarSeleccion(j.id)}
                  className={`border-t border-neutral-900 cursor-pointer hover:bg-neutral-900/60 ${
                    marcado ? "bg-neutral-900" : ""
                  } ${deshabilitado ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={deshabilitado}
                      onChange={() => alternarSeleccion(j.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Avatar src={urlFotoJugador(j.id)} alt={j.nombre} size={32} />
                      {j.nombre}
                    </div>
                  </td>
                  <td className="p-3 text-neutral-400">
                    <div className="flex items-center gap-2">
                      {j.equipoId !== null && (
                        <Avatar src={urlEscudoEquipo(j.equipoId)!} alt={j.equipo} size={20} />
                      )}
                      {j.equipo}
                    </div>
                  </td>
                  <td className="p-3 text-neutral-400">{j.posicion}</td>
                  <td className="p-3 text-right tabular-nums">{formatearValor(j.valor)}</td>
                  <td className="p-3 text-right tabular-nums">{j.puntosTotales}</td>
                  <td className="p-3 text-neutral-400">{formatearEstado(j.estado)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
