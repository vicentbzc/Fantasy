"use client";

export function RanuraAgregar({
  size,
  onClick,
}: {
  size: number | string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: size,
        minHeight: typeof size === "number" ? size + 22 : `calc(${size} + 22px)`,
      }}
      className="flex items-center justify-center rounded-[12px] bg-[#F5F5F7] text-neutral-500 text-lg font-medium transition-colors duration-200 hover:bg-[#FAFAFC] shrink-0"
    >
      +
    </button>
  );
}
