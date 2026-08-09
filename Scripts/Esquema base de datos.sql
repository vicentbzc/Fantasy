create table equipos (
    nombre text primary key
);

create table jugadores (
    id integer primary key,
    nombre text not null,
    equipo text references equipos(nombre),
    posicion text,
    porcentaje_titularidad numeric,
    valor bigint,
    diferencia_valor bigint,
    porcentaje_diferencia numeric,
    aceleracion text,
    tendencia_dias integer,
    estado text,
    minutos_jugados integer,
    actualizado_en timestamptz not null default now()
);

create table historial_valor (
    id integer not null references jugadores(id),
    jugador text not null,
    fecha date not null,
    equipo text references equipos(nombre),
    valor bigint,
    primary key (id, fecha)
);

create table puntos_jornada (
    id integer not null references jugadores(id),
    jugador text not null,
    jornada integer not null,
    equipo text references equipos(nombre),
    puntos integer,
    estadisticas text,
    tarjetas_amarillas_acumuladas integer,
    primary key (id, jornada)
);

create table calendario (
    equipo text not null references equipos(nombre),
    orden integer not null,
    rival text,
    competicion text,
    jornada text,
    dia text,
    hora text,
    estadio text,
    dificultad text,
    primary key (equipo, orden)
);
