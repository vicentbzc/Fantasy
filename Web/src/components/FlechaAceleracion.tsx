// Indicador de aceleración de la revalorización, junto al dato de revalorización
// de toda la web. "Estable" (y "sin dato") no pintan nada; el resto pinta un
// chevron: verde hacia arriba si acelera, rojo hacia abajo si frena, doble si
// el cambio es fuerte. Ver "Trigésima sexta ronda" en Notas proyecto.md.

const FORMAS: Record<string, string[]> = {
  "Acelera mucho": ["M5 11.5 L12 4.5 L19 11.5", "M5 20.5 L12 13.5 L19 20.5"],
  Acelera: ["M5 15.5 L12 8.5 L19 15.5"],
  Desacelera: ["M5 8.5 L12 15.5 L19 8.5"],
  "Desacelera mucho": ["M5 4.5 L12 11.5 L19 4.5", "M5 13.5 L12 20.5 L19 13.5"],
};

const COLORES: Record<string, string> = {
  "Acelera mucho": "#3BB568",
  Acelera: "#3BB568",
  Desacelera: "#FE645F",
  "Desacelera mucho": "#FE645F",
};

const ETIQUETAS: Record<string, string> = {
  "Acelera mucho": "La revalorización acelera con fuerza",
  Acelera: "La revalorización acelera",
  Desacelera: "La revalorización se frena",
  "Desacelera mucho": "La revalorización se frena con fuerza",
};

export function FlechaAceleracion({
  aceleracion,
  size = 13,
  className = "",
}: {
  aceleracion: string | null;
  size?: number;
  className?: string;
}) {
  const formas = aceleracion ? FORMAS[aceleracion] : undefined;
  if (!formas) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={COLORES[aceleracion!]}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ETIQUETAS[aceleracion!]}
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
    >
      {formas.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
