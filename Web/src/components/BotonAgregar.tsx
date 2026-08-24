"use client";

export function BotonAgregar({
  size = 36,
  texto,
  onClick,
  className = "bg-white",
}: {
  size?: number;
  texto?: string;
  onClick?: () => void;
  className?: string;
}) {
  if (texto) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{ height: size }}
        className={`flex items-center gap-1 rounded-[12px] px-3 text-sm text-neutral-600 transition-colors duration-200 hover:bg-[#FAFAFC] shrink-0 ${className}`}
      >
        <span className="text-base leading-none">+</span> {texto}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: size, height: size }}
      className={`flex items-center justify-center rounded-[12px] text-neutral-500 text-lg font-medium transition-colors duration-200 hover:bg-[#FAFAFC] shrink-0 ${className}`}
    >
      +
    </button>
  );
}
