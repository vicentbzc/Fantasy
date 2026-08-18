import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
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
