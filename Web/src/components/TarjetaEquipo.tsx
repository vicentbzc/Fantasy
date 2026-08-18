"use client";

import Image from "next/image";
import { useState } from "react";

export function TarjetaEquipo({ nombre, src }: { nombre: string; src: string | null }) {
  const [error, setError] = useState(false);

  return (
    <div className="aspect-square rounded-[30px] bg-white hover:bg-[#FAFAFC] transition-colors duration-200 flex items-center justify-center p-[31%]">
      {src && !error ? (
        <Image
          src={src}
          alt={nombre}
          width={90}
          height={90}
          className="object-contain w-full h-full"
          onError={() => setError(true)}
        />
      ) : (
        <span className="text-xs text-neutral-400 text-center">{nombre}</span>
      )}
    </div>
  );
}
