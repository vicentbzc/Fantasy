import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { BotonChatFlotante } from "@/components/BotonChatFlotante";
import { AnclaTeclado } from "@/components/AnclaTeclado";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Análisis Fantasy",
  description: "Datos y comparación de jugadores de LaLiga Fantasy Oficial",
  applicationName: "Análisis Fantasy",
  appleWebApp: { title: "Análisis Fantasy" },
};

// Bloquea el zoom del navegador (incluido el de iOS al enfocar un input) y
// hace que el teclado se superponga sin redimensionar el layout, así el
// contenido de la página no se desplaza hacia arriba al abrirse el teclado.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-visual",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#F5F5F7] text-[#1D1D1F] font-sans">
        <NavBar />
        <div className="flex-1 flex flex-col">{children}</div>
        <BotonChatFlotante />
        <AnclaTeclado />
      </body>
    </html>
  );
}
