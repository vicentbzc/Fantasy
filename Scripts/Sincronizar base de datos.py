import csv
import os
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


def parsear_numero(texto):
    if not texto:
        return None
    return float(texto)


def parsear_jornada_numero(texto):
    coincidencia = re.search(r"\d+", texto or "")
    return int(coincidencia.group()) if coincidencia else None


def parsear_entero(texto):
    if texto in (None, ""):
        return None
    return int(float(texto))


def parsear_entero_absoluto(texto):
    valor = parsear_entero(texto)
    return None if valor is None else abs(valor)


def parsear_fecha(texto):
    return datetime.strptime(texto, "%d/%m/%Y").date()


def dividir(texto):
    return texto.split(" | ") if texto else []


def primero_no_nulo(*valores):
    for valor in valores:
        if valor is not None:
            return valor
    return None


def tokenizar_nombre(nombre):
    return [t for t in re.split(r"[^a-z0-9]+", Común.normalizar_nombre(nombre)) if t]


MINIMO_LETRAS_PREFIJO_FUERTE = 4


def coincidencia_fuerte(a, b):
    if a == b:
        return True
    corto, largo = (a, b) if len(a) <= len(b) else (b, a)
    return len(corto) >= MINIMO_LETRAS_PREFIJO_FUERTE and largo.startswith(corto)


def tokens_coinciden(a, b):
    if coincidencia_fuerte(a, b):
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

    hay_coincidencia_fuerte = False
    pendientes = []
    for token in cortos:
        indice_fuerte = next((i for i, candidato in enumerate(restantes) if coincidencia_fuerte(token, candidato)), None)
        if indice_fuerte is not None:
            hay_coincidencia_fuerte = True
            del restantes[indice_fuerte]
        else:
            pendientes.append(token)

    sin_coincidencia = 0
    for token in pendientes:
        indice_comodin = next((i for i, candidato in enumerate(restantes) if tokens_coinciden(token, candidato)), None)
        if indice_comodin is None:
            sin_coincidencia += 1
        else:
            del restantes[indice_comodin]

    return hay_coincidencia_fuerte and sin_coincidencia == 0


def emparejar_por_nombre(filas_objetivo, filas_fuente):
    por_equipo = {}
    for fila in filas_fuente:
        por_equipo.setdefault(fila["Equipo"], []).append(fila)

    resultado = {}
    for fila in filas_objetivo:
        candidatos = por_equipo.get(fila["Equipo"], [])
        for i, candidato in enumerate(candidatos):
            if nombres_coinciden(fila["Jugador"], candidato["Jugador"]):
                resultado[fila["ID"]] = candidato
                del candidatos[i]
                break
    return resultado


def leer_csv(nombre_archivo):
    ruta = Común.ruta_datos(nombre_archivo)
    with open(ruta, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def leer_csv_opcional(nombre_archivo):
    ruta = Común.ruta_datos(nombre_archivo)
    if not os.path.isfile(ruta):
        return []
    with open(ruta, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def sincronizar_equipos(cur):
    nombres_oficiales = {fila["Equipo"]: fila["Nombre oficial"] for fila in leer_csv_opcional("Datos Equipos.csv")}
    filas = [
        (nombre, Común.NOMBRE_OFICIAL_A_ID.get(nombre), nombres_oficiales.get(nombre))
        for nombre in Común.MAPA_EQUIPOS_INVERSO.keys()
    ]
    execute_values(
        cur,
        """
        insert into equipos (nombre, id, nombre_oficial) values %s
        on conflict (nombre) do update set
            id = excluded.id,
            nombre_oficial = coalesce(excluded.nombre_oficial, equipos.nombre_oficial)
        """,
        filas,
    )
    return len(filas)


def sincronizar_jugadores(cur):
    jugadores = leer_csv("Datos Jugadores.csv")
    coincidencias_mercado = emparejar_por_nombre(jugadores, leer_csv("Datos Titularidad.csv"))
    coincidencias_estado = emparejar_por_nombre(jugadores, leer_csv("Datos Estado.csv"))
    posiciones = leer_csv_opcional("Datos Posicion.csv")
    coincidencias_posicion = emparejar_por_nombre(jugadores, posiciones)

    usadas = {(fila["Equipo"], fila["Jugador"]) for fila in coincidencias_posicion.values()}
    posiciones_sin_oficial = [p for p in posiciones if (p["Equipo"], p["Jugador"]) not in usadas]

    minutos_por_id = {fila["ID"]: fila["Minutos"] for fila in leer_csv_opcional("Datos Minutos.csv")}

    filas = [
        (
            int(jugador["ID"]),
            jugador["Jugador"],
            jugador["Equipo"],
            jugador["Posición"],
            primero_no_nulo(
                parsear_porcentaje(coincidencias_mercado.get(jugador["ID"], {}).get("Porcentaje de titularidad")),
                parsear_numero(coincidencias_posicion.get(jugador["ID"], {}).get("Probabilidad")),
            ),
            parsear_entero_miles(jugador["Valor"]),
            parsear_entero_miles(jugador["Valor en la liga"]),
            coincidencias_estado.get(jugador["ID"], {}).get("Estado", "Disponible para competir"),
            parsear_numero(coincidencias_posicion.get(jugador["ID"], {}).get("Posicion X")),
            parsear_numero(coincidencias_posicion.get(jugador["ID"], {}).get("Posicion Y")),
            parsear_entero(minutos_por_id.get(jugador["ID"])),
            parsear_entero(coincidencias_mercado.get(jugador["ID"], {}).get("Diferencia")),
            parsear_numero(coincidencias_mercado.get(jugador["ID"], {}).get("Diferencia porcentaje")),
            parsear_entero_absoluto(coincidencias_mercado.get(jugador["ID"], {}).get("Tendencia")),
        )
        for jugador in jugadores
    ]

    if not filas:
        return 0

    execute_values(
        cur,
        """
        insert into jugadores (
            id, nombre, equipo, posicion, porcentaje_titularidad, valor, valor_liga, estado,
            posicion_x, posicion_y, minutos_jugados, diferencia_valor, porcentaje_diferencia,
            tendencia_dias
        ) values %s
        on conflict (id) do update set
            nombre = excluded.nombre,
            equipo = excluded.equipo,
            posicion = excluded.posicion,
            porcentaje_titularidad = excluded.porcentaje_titularidad,
            valor = excluded.valor,
            valor_liga = excluded.valor_liga,
            estado = excluded.estado,
            posicion_x = excluded.posicion_x,
            posicion_y = excluded.posicion_y,
            minutos_jugados = excluded.minutos_jugados,
            diferencia_valor = excluded.diferencia_valor,
            porcentaje_diferencia = excluded.porcentaje_diferencia,
            tendencia_dias = excluded.tendencia_dias,
            actualizado_en = now()
        """,
        filas,
    )

    fotos = [
        {"ID": jugador["ID"], "Foto": jugador["Foto"]}
        for jugador in jugadores
        if jugador.get("Foto")
    ]
    Común.guardar_csv(Común.ruta_datos("Datos Fotos.csv"), ["ID", "Foto"], fotos)

    cur.execute("delete from posicion_sin_oficial")
    if posiciones_sin_oficial:
        execute_values(
            cur,
            "insert into posicion_sin_oficial (equipo, nombre, posicion_x, posicion_y, probabilidad) values %s",
            [
                (
                    p["Equipo"],
                    p["Jugador"],
                    parsear_numero(p["Posicion X"]),
                    parsear_numero(p["Posicion Y"]),
                    parsear_numero(p.get("Probabilidad")),
                )
                for p in posiciones_sin_oficial
            ],
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
        where posicion <= 3
        order by id, fecha desc
    """)

    historico_por_jugador = {}
    for id_jugador, fecha, valor in cur.fetchall():
        historico_por_jugador.setdefault(id_jugador, []).append(valor)

    actualizaciones = []
    for id_jugador, valores in historico_por_jugador.items():
        if len(valores) < 2 or valores[0] is None or valores[1] is None or not valores[1]:
            continue

        porcentaje = round((valores[0] - valores[1]) / valores[1] * 100, 2)

        aceleracion = "Estable"
        if len(valores) >= 3 and valores[2] not in (None, 0):
            porcentaje_anterior = round((valores[1] - valores[2]) / valores[2] * 100, 2)
            aceleracion = clasificar_aceleracion(porcentaje, porcentaje_anterior)

        actualizaciones.append((id_jugador, aceleracion))

    if not actualizaciones:
        return 0

    execute_values(
        cur,
        """
        update jugadores as j set
            aceleracion = datos.aceleracion
        from (values %s) as datos (id, aceleracion)
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

    cur.execute("delete from puntos_jornada_detalle")
    cur.execute("delete from puntos_jornada")

    if not filas:
        return 0

    execute_values(
        cur,
        """
        insert into puntos_jornada (
            id, jugador, jornada, equipo, puntos, estadisticas,
            tarjetas_amarillas_acumuladas
        ) values %s
        """,
        filas,
    )
    return len(filas)


def sincronizar_detalle(cur):
    filas = [
        (
            int(fila["ID"]),
            parsear_jornada_numero(fila["Jornada"]),
            parsear_entero(fila["Orden"]),
            fila["Estadística"],
            parsear_numero(fila["Cantidad"]),
            parsear_numero(fila["Puntos"]),
        )
        for fila in leer_csv_opcional("Datos Puntos jornada detalle.csv")
    ]

    cur.execute("select id, jornada from puntos_jornada")
    pares_validos = set(cur.fetchall())
    filas = [fila for fila in filas if (fila[0], fila[1]) in pares_validos]

    cur.execute("delete from puntos_jornada_detalle")

    if not filas:
        return 0

    execute_values(
        cur,
        """
        insert into puntos_jornada_detalle (
            id, jornada, orden, estadistica, cantidad, puntos
        ) values %s
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
    conexion = psycopg2.connect(Común.obtener_configuracion("DATABASE_URL"))
    try:
        with conexion.cursor() as cur:
            for nombre, funcion in [
                ("equipos", sincronizar_equipos),
                ("jugadores", sincronizar_jugadores),
                ("historial_valor", sincronizar_historial),
                ("tendencias", calcular_tendencias),
                ("puntos_jornada", sincronizar_puntos),
                ("puntos_jornada_detalle", sincronizar_detalle),
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
