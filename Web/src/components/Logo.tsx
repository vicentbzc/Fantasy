import Image from "next/image";

export function Logo({ size = 16 }: { size?: number }) {
  return <Image src="/logo.png" alt="Logo" width={size} height={size} className="object-contain" />;
}
