import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Solo para `next dev`: permite cargar los assets del servidor de desarrollo
  // desde el móvil por la IP local. No afecta al build de producción.
  allowedDevOrigins: ["192.168.1.33"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "wsmfnigtenshzrctkfcj.supabase.co",
        pathname: "/storage/v1/object/public/imagenes/**",
      },
    ],
  },
};

export default nextConfig;
