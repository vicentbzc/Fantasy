"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const escuchas = new Map<string, Set<() => void>>();

function notificar(clave: string) {
  escuchas.get(clave)?.forEach((alCambiar) => alCambiar());
}

function suscribir(clave: string, alCambiar: () => void) {
  if (!escuchas.has(clave)) escuchas.set(clave, new Set());
  const grupo = escuchas.get(clave)!;
  grupo.add(alCambiar);

  function alAlmacenamientoExterno(evento: StorageEvent) {
    if (evento.key === clave) alCambiar();
  }
  window.addEventListener("storage", alAlmacenamientoExterno);

  return () => {
    grupo.delete(alCambiar);
    window.removeEventListener("storage", alAlmacenamientoExterno);
  };
}

function obtenerServidor() {
  return null;
}

function leer<T>(clave: string, valorInicial: T): T {
  const crudo = window.localStorage.getItem(clave);
  if (crudo === null) return valorInicial;
  try {
    return JSON.parse(crudo) as T;
  } catch {
    return valorInicial;
  }
}

export function usePersistedState<T>(clave: string, valorInicial: T) {
  const suscribirClave = useCallback((alCambiar: () => void) => suscribir(clave, alCambiar), [clave]);
  const obtenerCliente = useCallback(() => window.localStorage.getItem(clave), [clave]);
  const crudo = useSyncExternalStore(suscribirClave, obtenerCliente, obtenerServidor);

  const valor = useMemo<T>(() => (crudo === null ? valorInicial : leer(clave, valorInicial)), [crudo, clave, valorInicial]);

  const setValor = useCallback(
    (actualizador: T | ((actual: T) => T)) => {
      const actual = leer(clave, valorInicial);
      const nuevo = typeof actualizador === "function" ? (actualizador as (a: T) => T)(actual) : actualizador;
      window.localStorage.setItem(clave, JSON.stringify(nuevo));
      notificar(clave);
    },
    [clave, valorInicial]
  );

  return [valor, setValor] as const;
}
