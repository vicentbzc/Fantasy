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
    dueno text,
    protegido_hasta timestamptz,
    en_mercado boolean not null default false,
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
    fecha date,
    hora text,
    estadio text,
    dificultad text,
    primary key (equipo, orden)
);

create table posicion_sin_oficial (
    equipo text not null references equipos(nombre),
    nombre text not null,
    posicion_x numeric,
    posicion_y numeric,
    probabilidad numeric,
    primary key (equipo, nombre)
);

create table mi_club (
    id integer primary key default 1,
    dinero bigint,
    fichas integer,
    valor_equipo bigint,
    manager text,
    check (id = 1)
);

create table mi_equipo_jugadores (
    jugador_id integer primary key references jugadores(id),
    estado text not null check (estado in ('titular', 'suplente', 'duda', 'seguimiento'))
);

create table notificaciones_estado (
    clave text primary key,
    valor text,
    actualizado_en timestamptz not null default now()
);

create table managers (
    id bigint primary key,
    nombre text not null
);

create table clasificacion_jornada (
    jornada integer not null,
    posicion integer not null,
    equipo_id text not null,
    manager text not null,
    puntos integer,
    primary key (jornada, equipo_id)
);

create table actividad_mercado (
    id bigint primary key,
    tipo integer not null,
    jugador_id integer,
    usuario_id bigint,
    usuario_destino_id bigint,
    importe bigint,
    fecha timestamptz not null
);
