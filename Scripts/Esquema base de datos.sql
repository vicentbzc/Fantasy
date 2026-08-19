create table equipos (
    id integer unique,
    nombre text primary key,
    nombre_oficial text
);

create table jugadores (
    id integer primary key,
    nombre text not null,
    equipo text references equipos(nombre),
    posicion text,
    porcentaje_titularidad numeric,
    valor bigint,
    valor_liga bigint,
    diferencia_valor bigint,
    porcentaje_diferencia numeric,
    aceleracion text,
    tendencia_dias integer,
    estado text,
    minutos_jugados integer,
    posicion_x numeric,
    posicion_y numeric,
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

create table puntos_jornada_detalle (
    id integer not null,
    jornada integer not null,
    orden integer not null,
    estadistica text not null,
    cantidad numeric,
    puntos numeric not null,
    primary key (id, jornada, orden),
    foreign key (id, jornada) references puntos_jornada(id, jornada)
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

create table posicion_sin_oficial (
    equipo text not null references equipos(nombre),
    nombre text not null,
    posicion_x numeric not null,
    posicion_y numeric not null,
    primary key (equipo, nombre)
);
