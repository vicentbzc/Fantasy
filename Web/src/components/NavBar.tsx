import Link from "next/link";

const ENLACES = [
  { href: "/", etiqueta: "Inicio" },
  { href: "/equipos", etiqueta: "Equipos" },
  { href: "/jugadores", etiqueta: "Jugadores" },
  { href: "/comparador", etiqueta: "Comparador" },
  { href: "/mi-equipo", etiqueta: "Mi equipo" },
];

export function NavBar() {
  return (
    <nav className="h-12 flex items-center justify-center gap-10 text-[12px] shrink-0 bg-[#F5F5F7]/[0.82] backdrop-blur-[18px]">
      {ENLACES.map(({ href, etiqueta }) => (
        <Link
          key={href}
          href={href}
          className="text-[#1D1D1F] transition-colors duration-200 hover:text-[#FE4B44]"
        >
          {etiqueta}
        </Link>
      ))}
    </nav>
  );
}
