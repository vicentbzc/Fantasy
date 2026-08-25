import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { BotonChatFlotante } from "@/components/BotonChatFlotante";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LaLiga Fantasy Analytics",
  description: "Datos y comparación de jugadores de LaLiga Fantasy Oficial",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#F5F5F7] text-[#1D1D1F] font-sans">
        <NavBar />
        <div className="flex-1 flex flex-col">{children}</div>
        <BotonChatFlotante />
      </body>
    </html>
  );
}
