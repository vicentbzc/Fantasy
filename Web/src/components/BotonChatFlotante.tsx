"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function BotonChatFlotante() {
  const pathname = usePathname();
  const [resaltado, setResaltado] = useState(false);

  useEffect(() => {
    if (pathname === "/chat") setResaltado(false);
  }, [pathname]);

  if (pathname === "/chat") return null;

  return (
    <Link
      href="/chat"
      aria-label="Chat"
      onMouseEnter={() => setResaltado(true)}
      onMouseLeave={() => setResaltado(false)}
      style={{
        backgroundColor: resaltado ? "#FE8B87" : "#FE645F",
        // Promociona el botón a su propia capa: en iOS mantiene `fixed`
        // clavado durante el scroll (si no, "salta" o desaparece).
        transform: "translateZ(0)",
        willChange: "transform",
      }}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-[14px] text-white shadow-lg transition-colors duration-200"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </Link>
  );
}
