"use client";

import Link from "next/link";
import { useState } from "react";

const ENLACES = [
  { href: "/", etiqueta: "Inicio" },
  { href: "/equipos", etiqueta: "Equipos" },
  { href: "/jugadores", etiqueta: "Jugadores" },
  { href: "/mi-equipo", etiqueta: "Mi equipo" },
];

export function NavBar() {
  const [resaltado, setResaltado] = useState<string | null>(null);

  return (
    <nav className="h-12 flex items-center justify-center gap-10 text-[12px] shrink-0 bg-[#F5F5F7]/[0.82] backdrop-blur-[18px]">
      {ENLACES.map(({ href, etiqueta }) => (
        <Link
          key={href}
          href={href}
          onMouseEnter={() => setResaltado(href)}
          onMouseLeave={() => setResaltado(null)}
          style={{ color: resaltado === href ? "#FE8B87" : "#1D1D1F" }}
          className="transition-colors duration-200"
        >
          {etiqueta}
        </Link>
      ))}
    </nav>
  );
}
