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
    <div className="rounded-[18px] bg-white p-[18px] flex flex-col gap-1 text-left">
      <p className="text-sm text-neutral-500">{etiqueta}</p>
      <p className="text-xl font-bold tabular-nums" style={{ color }}>
        {valor}
      </p>
    </div>
  );
}
