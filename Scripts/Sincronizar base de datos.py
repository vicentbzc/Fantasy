import csv
import re
from datetime import datetime

import psycopg2
from psycopg2.extras import execute_values

import Común


def parsear_entero_miles(texto):
    if not texto:
        return None
    return int(texto.replace(".", ""))


def parsear_porcentaje(texto):
    if not texto:
        return None
    return float(texto.rstrip("%"))


def parsear_jornada_numero(texto):
    coincidencia = re.search(r"\d+", texto or "")
    return int(coincidencia.group()) if coincidencia else None


def parsear_entero(texto):
    if texto in (None, ""):
        return None
    return int(float(texto))


def parsear_fecha(texto):
    return datetime.strptime(texto, "%d/%m/%Y").date()


def dividir(texto):
    return texto.split(" | ") if texto else []


def tokenizar_nombre(nombre):
    return [t for t in re.split(r"[^a-z0-9]+", Común.normalizar_nombre(nombre)) if t]


def tokens_coinciden(a, b):
    if a == b:
        return True
    if len(a) == 1 or len(b) == 1:
        return a[0] == b[0]
    return False


def nombres_coinciden(nombre_a, nombre_b):
    tokens_a = tokenizar_nombre(nombre_a)
    tokens_b = tokenizar_nombre(nombre_b)
    if not tokens_a or not tokens_b:
        return False
    cortos, largos = (tokens_a, tokens_b) if len(tokens_a) <= len(tokens_b) else (tokens_b, tokens_a)
    restantes = list(largos)
    for token in cortos:
        for i, candidato in enumerate(restantes):
            if tokens_coinciden(token, candidato):
                del restantes[i]
                break
        else:
            return False
    return True


def emparejar_por_nombre(filas_objetivo, filas_fuente, columna_valor):
    por_equipo = {}
    for fila in filas_fuente:
        por_equipo.setdefault(fila["Equipo"], []).append(fila)

    resultado = {}
    for fila in filas_objetivo:
        for candidato in por_equipo.get(fila["Equipo"], []):
            if nombres_coinciden(fila["Jugador"], candidato["Jugador"]):
                resultado[fila["ID"]] = candidato[columna_valor]
                break
    return resultado


PATRON_PARTE_ESTADISTICA = re.compile(r"^(?:(-?[\d.,]+) )?(.+): (-?\d+(?:\.\d+)?) puntos?$")


def parsear_cantidad_estadistica(texto):
    if texto is None:
        return None
    try:
        return float(texto.replace(",", "."))
    except ValueError:
        return None


def parsear_detalle_estadisticas(texto):
    if not texto or texto == "sin estadísticas destacadas":
        return []
    detalle = []
    for orden, parte in enumerate(texto.split(", "), start=1):
        coincidencia = PATRON_PARTE_ESTADISTICA.match(parte)
        if not coincidencia:
            continue
        cantidad_texto, estadistica, puntos_texto = coincidencia.groups()
        detalle.append((orden, estadistica, parsear_cantidad_estadistica(cantidad_texto), float(puntos_texto)))
    return detalle


def leer_csv(nombre_archivo):
    ruta = Común.ruta_datos(nombre_archivo)
    with open(ruta, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def sincronizar_equipos(cur):
    filas = [
        (nombre, Común.NOMBRE_OFICIAL_A_ID.get(nombre))
        for nombre in Común.MAPA_EQUIPOS_INVERSO.keys()
    ]
    execute_values(
        cur,
        "insert into equipos (nombre, id) values %s on conflict (nombre) do update set id = excluded.id",
        filas,
    )
    return len(filas)


def sincronizar_jugadores(cur):
    jugadores = leer_csv("Datos Jugadores.csv")
    titularidad_datos = leer_csv("Datos Titularidad.csv")
    titularidad_por_id = emparejar_por_nombre(jugadores, titularidad_datos, "Porcentaje de titularidad")
    foto_por_id = emparejar_por_nombre(jugadores, titularidad_datos, "Foto")
    estado_por_id = emparejar_por_nombre(jugadores, leer_csv("Datos Estado.csv"), "Estado")

    filas = [
        (
            int(jugador["ID"]),
            jugador["Jugador"],
            jugador["Equipo"],
            jugador["Posición"],
            parsear_porcentaje(titularidad_por_id.get(jugador["ID"])),
            parsear_entero_miles(jugador["Valor"]),
            parsear_entero_miles(jugador["Valor en la liga"]),
            estado_por_id.get(jugador["ID"], "Disponible"),
        )
        for jugador in jugadores
    ]

    if not filas:
        return 0

    execute_values(
        cur,
        """
        insert into jugadores (
            id, nombre, equipo, posicion, porcentaje_titularidad, valor, valor_liga, estado
        ) values %s
        on conflict (id) do update set
            nombre = excluded.nombre,
            equipo = excluded.equipo,
            posicion = excluded.posicion,
            porcentaje_titularidad = excluded.porcentaje_titularidad,
            valor = excluded.valor,
            valor_liga = excluded.valor_liga,
            estado = excluded.estado,
            actualizado_en = now()
        """,
        filas,
    )

    fotos = [
        (int(jugador["ID"]), foto_por_id[jugador["ID"]])
        for jugador in jugadores
        if foto_por_id.get(jugador["ID"])
    ]
    Común.guardar_csv(Común.ruta_datos("Datos Fotos.csv"), ["ID", "Foto"], [
        {"ID": id_jugador, "Foto": foto} for id_jugador, foto in fotos
    ])

    return len(filas)


def sincronizar_historial(cur):
    filas = [
        (
            int(fila["ID"]),
            fila["Jugador"],
            parsear_fecha(fila["Fecha"]),
            fila["Equipo"],
            parsear_entero_miles(fila["Valor"]),
        )
        for fila in leer_csv("Datos Historial valor.csv")
    ]

    if not filas:
        return 0

    execute_values(
        cur,
        """
        insert into historial_valor (id, jugador, fecha, equipo, valor)
        values %s
        on conflict (id, fecha) do nothing
        """,
        filas,
    )
    return len(filas)


UMBRAL_ACELERACION_MUCHO = 1.0
UMBRAL_ACELERACION_NORMAL = 0.2


def clasificar_aceleracion(velocidad_hoy, velocidad_ayer):
    if velocidad_hoy > 0 and velocidad_ayer < 0:
        return "Inflexión positiva"
    if velocidad_hoy < 0 and velocidad_ayer > 0:
        return "Inflexión negativa"
    cambio = velocidad_hoy - velocidad_ayer
    if cambio > UMBRAL_ACELERACION_MUCHO:
        return "Acelera mucho"
    if cambio > UMBRAL_ACELERACION_NORMAL:
        return "Acelera"
    if cambio < -UMBRAL_ACELERACION_MUCHO:
        return "Desacelera mucho"
    if cambio < -UMBRAL_ACELERACION_NORMAL:
        return "Desacelera"
    return "Estable"


def calcular_tendencias(cur):
    cur.execute("""
        select id, fecha, valor from (
            select id, fecha, valor,
                   row_number() over (partition by id order by fecha desc) as posicion
            from historial_valor
        ) reciente
        where posicion <= 15
        order by id, fecha desc
    """)

    historico_por_jugador = {}
    for id_jugador, fecha, valor in cur.fetchall():
        historico_por_jugador.setdefault(id_jugador, []).append(valor)

    actualizaciones = []
    for id_jugador, valores in historico_por_jugador.items():
        if len(valores) < 2 or valores[0] is None or valores[1] is None or not valores[1]:
            continue

        diferencia = valores[0] - valores[1]
        porcentaje = round(diferencia / valores[1] * 100, 2)

        direccion = 1 if diferencia > 0 else (-1 if diferencia < 0 else 0)
        tendencia_dias = 0
        for i in range(len(valores) - 1):
            if valores[i] is None or valores[i + 1] is None or not valores[i + 1]:
                break
            delta = valores[i] - valores[i + 1]
            dir_delta = 1 if delta > 0 else (-1 if delta < 0 else 0)
            if dir_delta != direccion or dir_delta == 0:
                break
            tendencia_dias += 1

        aceleracion = "Estable"
        if len(valores) >= 3 and valores[2] not in (None, 0):
            porcentaje_anterior = round((valores[1] - valores[2]) / valores[2] * 100, 2)
            aceleracion = clasificar_aceleracion(porcentaje, porcentaje_anterior)

        actualizaciones.append((id_jugador, diferencia, porcentaje, tendencia_dias, aceleracion))

    if not actualizaciones:
        return 0

    execute_values(
        cur,
        """
        update jugadores as j set
            diferencia_valor = datos.diferencia_valor,
            porcentaje_diferencia = datos.porcentaje_diferencia,
            tendencia_dias = datos.tendencia_dias,
            aceleracion = datos.aceleracion
        from (values %s) as datos (id, diferencia_valor, porcentaje_diferencia, tendencia_dias, aceleracion)
        where j.id = datos.id
        """,
        actualizaciones,
    )
    return len(actualizaciones)


def sincronizar_puntos(cur):
    filas = [
        (
            int(fila["ID"]),
            fila["Jugador"],
            parsear_jornada_numero(fila["Jornada"]),
            fila["Equipo"],
            parsear_entero(fila["Puntos"]),
            fila["Estadísticas"],
            parsear_entero(fila["Tarjetas amarillas acumuladas"]),
        )
        for fila in leer_csv("Datos Puntos jornada.csv")
    ]

    if not filas:
        return 0

    execute_values(
        cur,
        """
        insert into puntos_jornada (
            id, jugador, jornada, equipo, puntos, estadisticas,
            tarjetas_amarillas_acumuladas
        ) values %s
        on conflict (id, jornada) do update set
            jugador = excluded.jugador,
            equipo = excluded.equipo,
            puntos = excluded.puntos,
            estadisticas = excluded.estadisticas,
            tarjetas_amarillas_acumuladas = excluded.tarjetas_amarillas_acumuladas
        """,
        filas,
    )
    return len(filas)


def sincronizar_detalle_estadisticas(cur):
    pares_id_jornada = []
    detalle = []
    for fila in leer_csv("Datos Puntos jornada.csv"):
        id_jugador = int(fila["ID"])
        jornada = parsear_jornada_numero(fila["Jornada"])
        pares_id_jornada.append((id_jugador, jornada))
        for orden, estadistica, cantidad, puntos in parsear_detalle_estadisticas(fila["Estadísticas"]):
            detalle.append((id_jugador, jornada, orden, estadistica, cantidad, puntos))

    if not pares_id_jornada:
        return 0

    execute_values(
        cur,
        "delete from puntos_jornada_detalle where (id, jornada) in (values %s)",
        pares_id_jornada,
    )

    if detalle:
        execute_values(
            cur,
            """
            insert into puntos_jornada_detalle (id, jornada, orden, estadistica, cantidad, puntos)
            values %s
            """,
            detalle,
        )

    return len(detalle)


def sincronizar_calendario(cur):
    total = 0
    for fila in leer_csv("Datos 3.csv"):
        equipo = fila["Equipo"]
        rivales = dividir(fila["Siguientes rivales"])
        competiciones = dividir(fila["Competición"])
        jornadas = dividir(fila["Jornada"])
        dias = dividir(fila["Día"])
        horas = dividir(fila["Hora"])
        estadios = dividir(fila["Estadio"])
        dificultades = dividir(fila["Dificultad de los rivales"])

        cur.execute("delete from calendario where equipo = %s", (equipo,))

        filas_equipo = [
            (
                equipo, i + 1, rivales[i], competiciones[i], jornadas[i],
                dias[i], horas[i], estadios[i], dificultades[i],
            )
            for i in range(len(rivales))
        ]
        if filas_equipo:
            execute_values(
                cur,
                """
                insert into calendario (
                    equipo, orden, rival, competicion, jornada, dia, hora,
                    estadio, dificultad
                ) values %s
                """,
                filas_equipo,
            )
        total += len(filas_equipo)
    return total


def main():
    conexion = psycopg2.connect(Común.obtener_configuracion("DATABASE_URL"))
    try:
        with conexion.cursor() as cur:
            for nombre, funcion in [
                ("equipos", sincronizar_equipos),
                ("jugadores", sincronizar_jugadores),
                ("historial_valor", sincronizar_historial),
                ("tendencias", calcular_tendencias),
                ("puntos_jornada", sincronizar_puntos),
                ("puntos_jornada_detalle", sincronizar_detalle_estadisticas),
                ("calendario", sincronizar_calendario),
            ]:
                try:
                    filas_sincronizadas = funcion(cur)
                except Exception:
                    conexion.rollback()
                    print(f"Error sincronizando {nombre}")
                else:
                    conexion.commit()
                    print(f"{nombre}: {filas_sincronizadas} filas sincronizadas")
    finally:
        conexion.close()


if __name__ == "__main__":
    main()
