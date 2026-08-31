import { Pool } from "pg";
import { ORDEN_EQUIPOS } from "./equipos";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const ESTADISTICAS_DETALLE = [
  { clave: "goles", nombre: "goles", campo: "cantidad" },
  { clave: "asistenciasGol", nombre: "asistencias de gol", campo: "cantidad" },
  { clave: "asistenciasSinGol", nombre: "asistencias sin gol", campo: "cantidad" },
  { clave: "balonesArea", nombre: "balones al área", campo: "cantidad" },
  { clave: "penaltisProvocados", nombre: "penaltis provocados", campo: "cantidad" },
  { clave: "penaltisCometidos", nombre: "penaltis cometidos", campo: "cantidad" },
  { clave: "penaltisParados", nombre: "penaltis parados", campo: "cantidad" },
  { clave: "paradas", nombre: "paradas", campo: "cantidad" },
  { clave: "despejes", nombre: "despejes", campo: "cantidad" },
  { clave: "penaltisFallados", nombre: "penaltis fallados", campo: "cantidad" },
  { clave: "golesPropiaPuerta", nombre: "goles en propia puerta", campo: "cantidad" },
  { clave: "golesEnContra", nombre: "goles en contra", campo: "cantidad" },
  { clave: "tarjetasAmarillas", nombre: "tarjetas amarillas", campo: "cantidad" },
  { clave: "tarjetasRojas", nombre: "tarjetas rojas", campo: "cantidad" },
  { clave: "tirosPuerta", nombre: "tiros a puerta", campo: "cantidad" },
  { clave: "regates", nombre: "regates", campo: "cantidad" },
  { clave: "balonesRecuperados", nombre: "balones recuperados", campo: "cantidad" },
  { clave: "posesionesPerdidas", nombre: "posesiones perdidas", campo: "cantidad" },
  { clave: "puntosDazn", nombre: "Puntos DAZN", campo: "puntos" },
] as const;

type ClaveEstadisticaDetalle = (typeof ESTADISTICAS_DETALLE)[number]["clave"];

export type Jugador = {
  id: number;
  nombre: string;
  equipo: string;
  equipoNombreOficial: string | null;
  equipoId: number | null;
  posicion: string;
  porcentajeTitularidad: number | null;
  valorSinClausula: number | null;
  valor: number | null;
  diferenciaValor: number | null;
  porcentajeDiferencia: number | null;
  aceleracion: string | null;
  tendenciaDias: number | null;
  estado: string | null;
  minutosJugados: number | null;
  puntosTotales: number;
  puntosUltimaJornada: number | null;
  dificultadProximos5: number | null;
  proximoRival: string | null;
  proximoRivalNombreOficial: string | null;
  proximaDificultad: string | null;
  proximoDia: string | null;
  estadoMiEquipo: EstadoMiEquipo | null;
} & Record<ClaveEstadisticaDetalle, number | null>;

export type EstadoMiEquipo = "titular" | "suplente" | "duda" | "seguimiento";

export type Equipo = {
  id: number | null;
  nombre: string;
  nombreOficial: string | null;
};

export async function obtenerEquipos(): Promise<Equipo[]> {
  const resultado = await pool.query(`
    select id, nombre, nombre_oficial from equipos
  `);

  return resultado.rows
    .map((fila) => ({ id: fila.id, nombre: fila.nombre, nombreOficial: fila.nombre_oficial }))
    .sort((a, b) => ORDEN_EQUIPOS.indexOf(a.nombre) - ORDEN_EQUIPOS.indexOf(b.nombre));
}

export type Partido = {
  orden: number;
  rival: string | null;
  rivalNombreOficial: string | null;
  rivalId: number | null;
  competicion: string | null;
  jornada: string | null;
  dia: string | null;
  hora: string | null;
  dificultad: string | null;
  localVisitante: "Local" | "Visitante" | null;
};

export type EquipoDetalle = {
  id: number;
  nombre: string;
  nombreOficial: string | null;
  jornadaLiga: string | null;
  jornadaLigaOrden: number | null;
  rivalJornadaLiga: string | null;
  rivalJornadaLigaNombreOficial: string | null;
  rivalJornadaLigaId: number | null;
  diaJornadaLiga: string | null;
  horaJornadaLiga: string | null;
  localVisitanteJornadaLiga: "Local" | "Visitante" | null;
  dificultadJornadaLiga: string | null;
  partidos: Partido[];
};

export async function obtenerEquipoDetalle(id: number): Promise<EquipoDetalle | null> {
  const equipoResultado = await pool.query(`select id, nombre, nombre_oficial from equipos where id = $1`, [id]);
  const equipoFila = equipoResultado.rows[0];
  if (!equipoFila) return null;

  const partidosResultado = await pool.query(
    `
    select
      c.orden, c.rival, er.id as rival_id, er.nombre_oficial as rival_nombre_oficial,
      c.competicion, c.jornada, c.dia, c.hora, c.dificultad, c.estadio
    from calendario c
    left join equipos er on er.nombre = c.rival
    where c.equipo = $1
    order by c.orden
    `,
    [equipoFila.nombre]
  );

  const partidos: Partido[] = partidosResultado.rows.map((fila) => ({
    orden: fila.orden,
    rival: fila.rival,
    rivalNombreOficial: fila.rival_nombre_oficial,
    rivalId: fila.rival_id,
    competicion: fila.competicion,
    jornada: fila.jornada,
    dia: fila.dia,
    hora: fila.hora,
    dificultad: fila.dificultad || null,
    localVisitante: fila.estadio === "Local" || fila.estadio === "Visitante" ? fila.estadio : null,
  }));

  const proximaLiga = partidos.find((p) => p.competicion === "LaLiga") ?? null;

  return {
    id: equipoFila.id,
    nombre: equipoFila.nombre,
    nombreOficial: equipoFila.nombre_oficial,
    jornadaLiga: proximaLiga?.jornada?.replace(/^Jornada\s+/i, "") ?? null,
    jornadaLigaOrden: proximaLiga?.orden ?? null,
    rivalJornadaLiga: proximaLiga?.rival ?? null,
    rivalJornadaLigaNombreOficial: proximaLiga?.rivalNombreOficial ?? null,
    rivalJornadaLigaId: proximaLiga?.rivalId ?? null,
    diaJornadaLiga: proximaLiga?.dia ?? null,
    horaJornadaLiga: proximaLiga?.hora ?? null,
    localVisitanteJornadaLiga: proximaLiga?.localVisitante ?? null,
    dificultadJornadaLiga: proximaLiga?.dificultad ?? null,
    partidos,
  };
}

export type JugadorProbable = {
  id: number;
  nombre: string;
  posicion: string;
  probabilidad: number | null;
  posX: number | null;
  posY: number | null;
  esFantasma?: boolean;
};

export async function obtenerJugadoresEquipo(nombreEquipo: string): Promise<JugadorProbable[]> {
  const resultado = await pool.query(
    `select id, nombre, posicion, porcentaje_titularidad, posicion_x, posicion_y from jugadores where equipo = $1`,
    [nombreEquipo]
  );

  const jugadores: JugadorProbable[] = resultado.rows.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    posicion: fila.posicion,
    probabilidad: fila.porcentaje_titularidad === null ? null : Number(fila.porcentaje_titularidad),
    posX: fila.posicion_x === null ? null : Number(fila.posicion_x),
    posY: fila.posicion_y === null ? null : Number(fila.posicion_y),
  }));

  const sinOficial = await pool.query(
    `select nombre, posicion_x, posicion_y, probabilidad from posicion_sin_oficial where equipo = $1`,
    [nombreEquipo]
  );

  const fantasmas: JugadorProbable[] = sinOficial.rows.map((fila, i) => ({
    id: -(i + 1),
    nombre: fila.nombre,
    posicion: "",
    probabilidad: fila.probabilidad === null ? null : Number(fila.probabilidad),
    posX: fila.posicion_x === null ? null : Number(fila.posicion_x),
    posY: fila.posicion_y === null ? null : Number(fila.posicion_y),
    esFantasma: true,
  }));

  return [...jugadores, ...fantasmas];
}

function literalSql(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`;
}

export async function obtenerJugadores(): Promise<Jugador[]> {
  const camposDetalleAgregado = ESTADISTICAS_DETALLE.map(
    (e) => `coalesce(sum(case when estadistica = ${literalSql(e.nombre)} then ${e.campo} end), 0) as "${e.clave}"`
  ).join(",\n      ");

  const camposDetalleSelect = ESTADISTICAS_DETALLE.map((e) => `coalesce(d."${e.clave}", 0) as "${e.clave}"`).join(
    ",\n      "
  );

  const resultado = await pool.query(`
    with detalle_agregado as (
      select id,
      ${camposDetalleAgregado}
      from puntos_jornada_detalle
      group by id
    ),
    ultima_jornada as (
      select distinct on (id) id, puntos as puntos_ultima_jornada
      from puntos_jornada
      order by id, jornada desc
    ),
    totales_jornada as (
      select id, sum(puntos) as puntos_totales from puntos_jornada group by id
    ),
    dificultad_calendario as (
      select equipo, dificultad, row_number() over (partition by equipo order by orden) as rn
      from calendario
      where competicion = 'LaLiga' and dificultad <> ''
    ),
    dificultad_equipo as (
      select dc.equipo, avg(m.valor) as dificultad_prox5
      from dificultad_calendario dc
      join (values ('Muy baja',1),('Baja',2),('Media',3),('Alta',4),('Muy alta',5)) as m(nombre, valor)
        on m.nombre = dc.dificultad
      where dc.rn <= 5
      group by dc.equipo
    )
    select
      j.id, j.nombre, j.equipo, e.id as equipo_id, e.nombre_oficial as equipo_nombre_oficial, j.posicion,
      j.porcentaje_titularidad, j.valor as valor_sin_clausula, j.valor_liga as valor, j.diferencia_valor, j.porcentaje_diferencia,
      j.aceleracion, j.tendencia_dias, j.estado, j.minutos_jugados,
      coalesce(t.puntos_totales, 0) as puntos_totales,
      uj.puntos_ultima_jornada,
      (d.id is not null) as tiene_detalle,
      ${camposDetalleSelect},
      de.dificultad_prox5,
      c.rival as proximo_rival, re.nombre_oficial as proximo_rival_nombre_oficial,
      c.dificultad as proxima_dificultad, c.dia as proximo_dia,
      mej.estado as estado_mi_equipo
    from jugadores j
    left join equipos e on e.nombre = j.equipo
    left join detalle_agregado d on d.id = j.id
    left join ultima_jornada uj on uj.id = j.id
    left join totales_jornada t on t.id = j.id
    left join dificultad_equipo de on de.equipo = j.equipo
    left join calendario c on c.equipo = j.equipo and c.orden = 1
    left join equipos re on re.nombre = c.rival
    left join mi_equipo_jugadores mej on mej.jugador_id = j.id
    order by j.valor_liga desc nulls last
  `);

  return resultado.rows.map((fila) => {
    const base = {
      id: fila.id,
      nombre: fila.nombre,
      equipo: fila.equipo,
      equipoNombreOficial: fila.equipo_nombre_oficial,
      equipoId: fila.equipo_id,
      posicion: fila.posicion,
      porcentajeTitularidad: fila.porcentaje_titularidad === null ? null : Number(fila.porcentaje_titularidad),
      valorSinClausula: fila.valor_sin_clausula === null ? null : Number(fila.valor_sin_clausula),
      valor: fila.valor === null ? null : Number(fila.valor),
      diferenciaValor: fila.diferencia_valor === null ? null : Number(fila.diferencia_valor),
      porcentajeDiferencia: fila.porcentaje_diferencia === null ? null : Number(fila.porcentaje_diferencia),
      aceleracion: fila.aceleracion || null,
      tendenciaDias: fila.tendencia_dias,
      estado: fila.estado,
      minutosJugados: fila.minutos_jugados,
      puntosTotales: Number(fila.puntos_totales),
      puntosUltimaJornada: fila.puntos_ultima_jornada === null ? null : Number(fila.puntos_ultima_jornada),
      dificultadProximos5: fila.dificultad_prox5 === null ? null : Number(fila.dificultad_prox5),
      proximoRival: fila.proximo_rival,
      proximoRivalNombreOficial: fila.proximo_rival_nombre_oficial,
      proximaDificultad: fila.proxima_dificultad,
      proximoDia: fila.proximo_dia,
      estadoMiEquipo: fila.estado_mi_equipo,
    };

    const estadisticas = Object.fromEntries(
      ESTADISTICAS_DETALLE.map((e) => [e.clave, fila.tiene_detalle ? Number(fila[e.clave]) : null])
    ) as Record<ClaveEstadisticaDetalle, number | null>;

    return { ...base, ...estadisticas };
  });
}

export type PuntoHistorialValor = { fecha: string; valor: number };

export async function obtenerHistorialValor(id: number): Promise<PuntoHistorialValor[]> {
  const resultado = await pool.query(
    `select fecha, valor from historial_valor where id = $1 and fecha >= current_date - interval '1 month' order by fecha`,
    [id]
  );

  return resultado.rows.map((fila) => ({
    fecha: fila.fecha.toISOString().slice(0, 10),
    valor: Number(fila.valor),
  }));
}

export type DetalleEstadistica = {
  estadistica: string;
  cantidad: number;
  puntos: number;
};

export type JornadaPuntos = {
  jornada: number;
  puntos: number;
  estadisticas: string | null;
  desglose: DetalleEstadistica[];
};

export async function obtenerHistorialPuntos(id: number): Promise<JornadaPuntos[]> {
  const [puntosResultado, detalleResultado] = await Promise.all([
    pool.query(`select jornada, puntos, estadisticas from puntos_jornada where id = $1 order by jornada desc`, [id]),
    pool.query(
      `select jornada, estadistica, cantidad, puntos from puntos_jornada_detalle where id = $1 and puntos <> 0 order by jornada, orden`,
      [id]
    ),
  ]);

  const desglosePorJornada = new Map<number, DetalleEstadistica[]>();
  for (const fila of detalleResultado.rows) {
    const lista = desglosePorJornada.get(fila.jornada) ?? [];
    lista.push({
      estadistica: fila.estadistica,
      cantidad: Number(fila.cantidad),
      puntos: Number(fila.puntos),
    });
    desglosePorJornada.set(fila.jornada, lista);
  }

  return puntosResultado.rows.map((fila) => ({
    jornada: fila.jornada,
    puntos: fila.puntos,
    estadisticas: fila.estadisticas,
    desglose: desglosePorJornada.get(fila.jornada) ?? [],
  }));
}

export type MiClub = {
  dinero: number | null;
  fichas: number | null;
  valorEquipo: number | null;
  revalorizacion: number | null;
};

export async function obtenerMiClub(): Promise<MiClub> {
  const resultado = await pool.query(`select dinero, fichas, valor_equipo, revalorizacion from mi_club where id = 1`);
  const fila = resultado.rows[0];
  return {
    dinero: fila?.dinero === undefined || fila.dinero === null ? null : Number(fila.dinero),
    fichas: fila?.fichas === undefined || fila.fichas === null ? null : Number(fila.fichas),
    valorEquipo:
      fila?.valor_equipo === undefined || fila.valor_equipo === null ? null : Number(fila.valor_equipo),
    revalorizacion:
      fila?.revalorizacion === undefined || fila.revalorizacion === null ? null : Number(fila.revalorizacion),
  };
}

export type ResultadoEstadoMiEquipo = { ok: true } | { ok: false; motivo: string };

export async function establecerEstadoMiEquipo(
  jugadorId: number,
  estado: EstadoMiEquipo
): Promise<ResultadoEstadoMiEquipo> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");

    if (estado === "titular") {
      const jugadorResultado = await cliente.query(`select posicion from jugadores where id = $1`, [jugadorId]);
      const esPortero = jugadorResultado.rows[0]?.posicion === "Portero";

      if (esPortero) {
        const porteroResultado = await cliente.query(
          `select mej.jugador_id from mi_equipo_jugadores mej
           join jugadores j on j.id = mej.jugador_id
           where mej.estado = 'titular' and mej.jugador_id <> $1 and j.posicion = 'Portero'`,
          [jugadorId]
        );
        const porteroExistente = porteroResultado.rows[0]?.jugador_id ?? null;
        if (porteroExistente !== null) {
          await cliente.query(`update mi_equipo_jugadores set estado = 'suplente' where jugador_id = $1`, [
            porteroExistente,
          ]);
        }
      }
    }

    await cliente.query(
      `insert into mi_equipo_jugadores (jugador_id, estado) values ($1, $2)
       on conflict (jugador_id) do update set estado = excluded.estado`,
      [jugadorId, estado]
    );

    await cliente.query("commit");
    return { ok: true };
  } catch (error) {
    await cliente.query("rollback");
    throw error;
  } finally {
    cliente.release();
  }
}

export async function eliminarDeMiEquipo(jugadorId: number): Promise<void> {
  await pool.query(`delete from mi_equipo_jugadores where jugador_id = $1`, [jugadorId]);
}
