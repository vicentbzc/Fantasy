import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export type Jugador = {
  id: number;
  nombre: string;
  equipo: string;
  equipoId: number | null;
  posicion: string;
  porcentajeTitularidad: number | null;
  valor: number | null;
  diferenciaValor: number | null;
  porcentajeDiferencia: number | null;
  tendenciaDias: number | null;
  estado: string | null;
  minutosJugados: number | null;
  puntosTotales: number;
  proximoRival: string | null;
  proximaDificultad: string | null;
  proximoDia: string | null;
};

export async function obtenerJugadores(): Promise<Jugador[]> {
  const resultado = await pool.query(`
    select
      j.id, j.nombre, j.equipo, e.id as equipo_id, j.posicion,
      j.porcentaje_titularidad, j.valor, j.diferencia_valor,
      j.porcentaje_diferencia, j.tendencia_dias, j.estado, j.minutos_jugados,
      coalesce(p.puntos_totales, 0) as puntos_totales,
      c.rival as proximo_rival, c.dificultad as proxima_dificultad, c.dia as proximo_dia
    from jugadores j
    left join equipos e on e.nombre = j.equipo
    left join (
      select id, sum(puntos) as puntos_totales from puntos_jornada group by id
    ) p on p.id = j.id
    left join calendario c on c.equipo = j.equipo and c.orden = 1
    order by j.valor desc nulls last
  `);

  return resultado.rows.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    equipo: fila.equipo,
    equipoId: fila.equipo_id,
    posicion: fila.posicion,
    porcentajeTitularidad: fila.porcentaje_titularidad === null ? null : Number(fila.porcentaje_titularidad),
    valor: fila.valor === null ? null : Number(fila.valor),
    diferenciaValor: fila.diferencia_valor === null ? null : Number(fila.diferencia_valor),
    porcentajeDiferencia: fila.porcentaje_diferencia === null ? null : Number(fila.porcentaje_diferencia),
    tendenciaDias: fila.tendencia_dias,
    estado: fila.estado,
    minutosJugados: fila.minutos_jugados,
    puntosTotales: Number(fila.puntos_totales),
    proximoRival: fila.proximo_rival,
    proximaDificultad: fila.proxima_dificultad,
    proximoDia: fila.proximo_dia,
  }));
}
