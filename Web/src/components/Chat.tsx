"use client";

import { useState } from "react";
import { accionPreguntarIA } from "@/app/actions";
import type { MensajeChat } from "@/lib/ia";

function TextoOla({ texto }: { texto: string }) {
  return (
    <>
      {texto.split("").map((letra, indice) => (
        <span key={indice} className="letra-ola" style={{ animationDelay: `${indice * 0.08}s` }}>
          {letra}
        </span>
      ))}
    </>
  );
}

function BarraInput({
  pregunta,
  setPregunta,
  enviar,
  cargando,
  conSombra,
}: {
  pregunta: string;
  setPregunta: (valor: string) => void;
  enviar: () => void;
  cargando: boolean;
  conSombra: boolean;
}) {
  return (
    <div className="relative w-full max-w-[560px] mx-auto shrink-0">
      <input
        value={pregunta}
        onChange={(e) => setPregunta(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") enviar();
        }}
        placeholder="Escribe tu pregunta"
        className={`h-12 w-full bg-white rounded-[14px] pl-4 pr-12 text-sm transition-colors duration-200 hover:bg-[#FAFAFC] ${
          conSombra ? "shadow-[0_0_140px_40px_rgba(254,100,95,0.18)]" : ""
        }`}
      />
      {pregunta.trim() && (
        <button
          type="button"
          onClick={enviar}
          disabled={cargando}
          aria-label="Enviar"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-[10px] bg-[#FE645F] text-white transition-colors duration-200 hover:bg-[#FE8B87] disabled:opacity-40"
        >
          ↑
        </button>
      )}
    </div>
  );
}

export function Chat() {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [cargando, setCargando] = useState(false);
  const hayConversacion = mensajes.length > 0;

  async function enviar() {
    const texto = pregunta.trim();
    if (!texto || cargando) return;

    const historial = mensajes;
    setMensajes((actual) => [...actual, { rol: "user", texto }]);
    setPregunta("");
    setCargando(true);

    const respuesta = await accionPreguntarIA(texto, historial);
    setMensajes((actual) => [...actual, { rol: "assistant", texto: respuesta }]);
    setCargando(false);
  }

  return (
    <div
      className="max-w-[1576px] mx-auto w-full px-6 sm:px-12 relative"
      style={{ height: "calc(100vh - 48px)" }}
    >
      <div className="h-full pt-14 pb-24 overflow-y-auto flex flex-col gap-3">
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-[12px] px-4 py-2 text-sm whitespace-pre-wrap ${
                m.rol === "user" ? "bg-[#FE645F] text-white" : "bg-[#F5F5F7] text-[#1D1D1F]"
              }`}
            >
              {m.texto}
            </div>
          </div>
        ))}
        {cargando && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-[12px] px-4 py-2 text-sm bg-[#F5F5F7] text-neutral-500">
              <TextoOla texto="Pensando…" />
            </div>
          </div>
        )}
      </div>

      {!hayConversacion && (
        <p
          className="absolute left-0 right-0 text-3xl font-bold text-center"
          style={{ top: "42%", transform: "translateY(calc(-100% - 40px))" }}
        >
          Tu asistente deportivo con IA
        </p>
      )}

      <div
        className="absolute left-6 right-6 sm:left-12 sm:right-12 transition-[top,transform] duration-200 ease-out"
        style={
          hayConversacion
            ? { top: "100%", transform: "translateY(calc(-100% - 40px))" }
            : { top: "42%", transform: "translateY(-50%)" }
        }
      >
        <BarraInput
          pregunta={pregunta}
          setPregunta={setPregunta}
          enviar={enviar}
          cargando={cargando}
          conSombra={!hayConversacion}
        />
      </div>
    </div>
  );
}
