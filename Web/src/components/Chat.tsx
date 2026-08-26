"use client";

import { useState } from "react";
import { accionPreguntarIA } from "@/app/actions";
import type { MensajeChat } from "@/lib/ia";

export function Chat() {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [cargando, setCargando] = useState(false);

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
    <div className="max-w-[700px] mx-auto w-full px-6 pt-14 pb-10 flex flex-col gap-6" style={{ height: "calc(100vh - 48px)" }}>
      <div className="flex-1 overflow-y-auto flex flex-col gap-3">
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-[18px] px-4 py-2 text-sm whitespace-pre-wrap ${
                m.rol === "user" ? "bg-[#FE645F] text-white" : "bg-[#F5F5F7] text-[#1D1D1F]"
              }`}
            >
              {m.texto}
            </div>
          </div>
        ))}
        {cargando && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-[18px] px-4 py-2 text-sm bg-[#F5F5F7] text-neutral-500">
              Pensando…
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <input
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") enviar();
          }}
          placeholder="Escribe tu pregunta"
          className="h-12 bg-white rounded-[14px] px-4 text-sm flex-1 transition-colors duration-200 hover:bg-[#FAFAFC]"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={cargando || !pregunta.trim()}
          className="h-12 px-6 rounded-[14px] bg-[#FE645F] text-white text-sm font-medium transition-colors duration-200 hover:bg-[#FE8B87] disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
