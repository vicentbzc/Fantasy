"use client";

import { useEffect } from "react";

const NO_TEXTO = ["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"];

function esCampoTexto(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  return !NO_TEXTO.includes((el as HTMLInputElement).type);
}

/**
 * Solo móvil (`<640px`). iOS Safari ignora `interactive-widget`, así que al
 * enfocar un campo de texto desplaza toda la página para subir el input por
 * encima del teclado y no siempre lo deshace al cerrarlo. Mientras hay un campo
 * de texto enfocado en móvil, esto fija la posición de scroll de la ventana:
 * se guarda al enfocar y se restaura ante cualquier scroll/resize automático,
 * incluidos los eventos de `visualViewport` al abrirse y cerrarse el teclado.
 * Los scrolls internos (mensajes del chat, tabla de Jugadores) no disparan
 * `scroll` de `window`, así que siguen funcionando. En escritorio no hace nada.
 */
export function AnclaTeclado() {
  useEffect(() => {
    // Dispositivo con teclado en pantalla (móvil/tablet en cualquier
    // orientación); en escritorio no se activa.
    const esMovil = () =>
      window.matchMedia("(pointer: coarse) and (hover: none)").matches;

    let anclaY = 0;
    let anclado = false;

    const restaurar = () => {
      if (anclado && Math.abs(window.scrollY - anclaY) > 1) {
        window.scrollTo(0, anclaY);
      }
    };

    const alEnfocar = (e: FocusEvent) => {
      if (!esMovil() || !esCampoTexto(e.target)) return;
      anclaY = window.scrollY;
      anclado = true;
    };
    const alDesenfocar = (e: FocusEvent) => {
      if (!esCampoTexto(e.target)) return;
      // el teclado tarda un poco en cerrarse; seguimos anclando ese rato
      window.setTimeout(() => {
        anclado = false;
      }, 400);
    };

    const vv = window.visualViewport;

    document.addEventListener("focusin", alEnfocar);
    document.addEventListener("focusout", alDesenfocar);
    window.addEventListener("scroll", restaurar, { passive: true });
    vv?.addEventListener("resize", restaurar);
    vv?.addEventListener("scroll", restaurar);

    return () => {
      document.removeEventListener("focusin", alEnfocar);
      document.removeEventListener("focusout", alDesenfocar);
      window.removeEventListener("scroll", restaurar);
      vv?.removeEventListener("resize", restaurar);
      vv?.removeEventListener("scroll", restaurar);
    };
  }, []);

  return null;
}
