import { GoogleGenAI } from "@google/genai";
import type { Jugador } from "./db";
import { COLUMNAS_OPCIONALES, formatearCelda } from "./columnas";

export type MensajeChat = { rol: "user" | "assistant"; texto: string };

function jugadoresACsv(jugadores: Jugador[]): string {
  const columnas = [{ etiqueta: "Nombre" }, ...COLUMNAS_OPCIONALES];
  const cabecera = columnas.map((c) => c.etiqueta).join(",");

  const filas = jugadores.map((j) => {
    const valores = [j.nombre, ...COLUMNAS_OPCIONALES.map((c) => formatearCelda(c, j[c.clave]))];
    return valores.map((valor) => `"${String(valor).replace(/"/g, '""')}"`).join(",");
  });

  return [cabecera, ...filas].join("\n");
}

const INSTRUCCIONES = `Eres el asistente de una web de análisis de LaLiga Fantasy. Respondes preguntas sobre los jugadores usando ÚNICAMENTE los datos del CSV de más abajo — nunca inventes un dato que no esté ahí. Responde en español, de forma breve y conversacional, como en un chat.

Aclaraciones sobre las columnas:
- "Valor" es el valor oficial del juego (marketValue), igual en cualquier liga.
- "Valor en la liga" es la cláusula real del jugador en la liga privada del usuario (puede diferir del valor oficial si algún mánager la ha subido a mano).
- Las estadísticas de partido (goles, asistencias, tarjetas, paradas, etc.) son el TOTAL acumulado en toda la temporada, no de un partido concreto.
- Un valor "—" significa que no hay dato disponible para ese jugador, no que sea cero.
- "Dificultad del calendario" es la dificultad media de los próximos 5 partidos del equipo del jugador.
- "Tendencia" son los días consecutivos que el valor del jugador lleva subiendo o bajando en la misma dirección.

Si te preguntan por un precio recomendable, una valoración o cuánto ofrecer por un jugador, sí puedes y debes calcular una recomendación razonada a partir de los datos reales del CSV (Valor, Valor en la liga, Revalorización, Tendencia, Dificultad del calendario, Titularidad, puntos...) — eso no es inventar un dato, es una estimación tuya explicada con números reales como base. Deja claro que es una recomendación tuya, no un dato oficial.

Si una pregunta no se puede responder con estos datos, dilo claramente en vez de suponer algo.

Responde en texto plano, sin formato Markdown (nada de asteriscos para negrita/cursiva ni listas con *).`;

function quitarMarkdown(texto: string): string {
  return texto.replace(/^\s*\*\s+/gm, "- ").replace(/\*/g, "");
}

function construirEntrada(pregunta: string, historial: MensajeChat[]): string {
  if (historial.length === 0) return pregunta;

  const transcripcion = historial
    .map((m) => `${m.rol === "user" ? "Usuario" : "Asistente"}: ${m.texto}`)
    .join("\n");

  return `Conversación hasta ahora:\n${transcripcion}\n\nNueva pregunta del usuario: ${pregunta}`;
}

export async function preguntarSobreJugadores(
  pregunta: string,
  historial: MensajeChat[],
  jugadores: Jugador[]
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return "Falta configurar GEMINI_API_KEY en el servidor para poder usar el chat.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const respuesta = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: construirEntrada(pregunta, historial),
      config: {
        systemInstruction: `${INSTRUCCIONES}\n\nDatos de los jugadores (CSV):\n${jugadoresACsv(jugadores)}`,
      },
    });

    return respuesta.text ? quitarMarkdown(respuesta.text) : "No he podido generar una respuesta.";
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 401 || status === 403) {
      return "La clave de la API de Gemini no es válida.";
    }
    if (status === 429) {
      return "Se ha alcanzado el límite gratuito de peticiones a la IA. Inténtalo de nuevo en un momento.";
    }
    return `No se ha podido contactar con la IA: ${error instanceof Error ? error.message : "error desconocido"}`;
  }
}
