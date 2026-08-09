import csv
import importlib.util
import os
import re
from datetime import datetime

import psycopg2
from psycopg2.extras import execute_values

import Común


def obtener_database_url():
    variable_entorno = os.environ.get("DATABASE_URL")
    if variable_entorno:
        return variable_entorno
    ruta_configuracion_local = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Configuración local.py")
    spec_configuracion_local = importlib.util.spec_from_file_location("configuracion_local", ruta_configuracion_local)
    config_local = importlib.util.module_from_spec(spec_configuracion_local)
    spec_configuracion_local.loader.exec_module(config_local)
    return config_local.DATABASE_URL


def parsear_entero_miles(texto):
    if not texto:
        return None
    return int(texto.replace(".", ""))


def parsear_porcentaje(texto):
    if not texto:
        return None
    return float(texto.rstrip("%"))


def parsear_tendencia_dias(texto):
    coincidencia = re.match(r"(\d+)", texto or "")
    return int(coincidencia.group(1)) if coincidencia else None


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


def leer_csv(nombre_archivo):
    ruta = Común.ruta_datos(nombre_archivo)
    with open(ruta, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def sincronizar_equipos(cur):
    filas = [(nombre,) for nombre in Común.MAPA_EQUIPOS_INVERSO.keys()]
    execute_values(
        cur,
        "insert into equipos (nombre) values %s on conflict (nombre) do nothing",
        filas,
    )
    return len(filas)


def sincronizar_jugadores(cur):
    mercado = {fila["ID"]: fila for fila in leer_csv("Datos 1.csv")}
    fichas = {fila["ID"]: fila for fila in leer_csv("Datos 2.csv")}

    filas = []
    for id_texto, mercado_fila in mercado.items():
        ficha_fila = fichas.get(id_texto, {})
        filas.append((
            int(id_texto),
            mercado_fila["Jugador"],
            mercado_fila["Equipo"],
            mercado_fila["Posición"],
            parsear_porcentaje(mercado_fila["Porcentaje de titularidad"]),
            parsear_entero_miles(mercado_fila["Valor"]),
            parsear_entero_miles(mercado_fila["Diferencia de valor"]),
            parsear_porcentaje(mercado_fila["Porcentaje de diferencia"]),
            mercado_fila["Aceleración"],
            parsear_tendencia_dias(mercado_fila["Tendencia"]),
            ficha_fila.get("Estado"),
            parsear_entero(ficha_fila.get("Minutos jugados")),
        ))

    if not filas:
        return 0

    execute_values(
        cur,
        """
        insert into jugadores (
            id, nombre, equipo, posicion, porcentaje_titularidad, valor,
            diferencia_valor, porcentaje_diferencia, aceleracion, tendencia_dias,
            estado, minutos_jugados
        ) values %s
        on conflict (id) do update set
            nombre = excluded.nombre,
            equipo = excluded.equipo,
            posicion = excluded.posicion,
            porcentaje_titularidad = excluded.porcentaje_titularidad,
            valor = excluded.valor,
            diferencia_valor = excluded.diferencia_valor,
            porcentaje_diferencia = excluded.porcentaje_diferencia,
            aceleracion = excluded.aceleracion,
            tendencia_dias = excluded.tendencia_dias,
            estado = excluded.estado,
            minutos_jugados = excluded.minutos_jugados,
            actualizado_en = now()
        """,
        filas,
    )
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
        for fila in leer_csv("Datos 6.csv")
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
        for fila in leer_csv("Datos 4.csv")
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
    conexion = psycopg2.connect(obtener_database_url())
    try:
        with conexion.cursor() as cur:
            for nombre, funcion in [
                ("equipos", sincronizar_equipos),
                ("jugadores", sincronizar_jugadores),
                ("historial_valor", sincronizar_historial),
                ("puntos_jornada", sincronizar_puntos),
                ("calendario", sincronizar_calendario),
            ]:
                try:
                    filas_sincronizadas = funcion(cur)
                except Exception as error:
                    conexion.rollback()
                    print(f"Error sincronizando {nombre}: {error}")
                else:
                    conexion.commit()
                    print(f"{nombre}: {filas_sincronizadas} filas sincronizadas")
    finally:
        conexion.close()


if __name__ == "__main__":
    main()
