"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="max-w-[1104px] w-full mx-auto flex flex-col md:flex-row items-center gap-12 md:gap-[54px]">
        <motion.div
          className="shrink-0 overflow-hidden w-[280px] sm:w-[360px] md:w-[420px] lg:w-[490px] aspect-[490/576] relative"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <Image
            src="/inicio-ilustracion.png"
            alt=""
            fill
            className="object-cover"
            priority
          />
        </motion.div>
        <motion.div
          className="flex flex-col gap-6"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
        >
          <h1
            className="text-5xl sm:text-6xl md:text-7xl font-bold leading-[0.95] md:max-w-[560px]"
            style={{ letterSpacing: "-4px" }}
          >
            Juega cada jornada con ventaja.
          </h1>
          <p
            className="text-xl md:text-[22px] font-medium max-w-[360px]"
            style={{ letterSpacing: "-0.44px" }}
          >
            Bienvenido a la herramienta definitiva para LaLiga Fantasy.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
