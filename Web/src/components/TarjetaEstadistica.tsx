export function TarjetaEstadistica({
  etiqueta,
  valor,
  color,
}: {
  etiqueta: string;
  valor: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-left">
      <h2 className="text-[20px] font-bold">{etiqueta}</h2>
      <p className="text-lg font-bold text-neutral-500 tabular-nums" style={{ color }}>
        {valor}
      </p>
    </div>
  );
}
