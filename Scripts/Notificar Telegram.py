import re
from datetime import datetime
from datetime import time as Hora
from zoneinfo import ZoneInfo

import psycopg2

import Común

ZONA_BARCELONA = ZoneInfo("Europe/Madrid")

MAPA_DIAS_SEMANA = {
    0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves",
    4: "Viernes", 5: "Sábado", 6: "Domingo",
}

MAPA_MESES = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril", 5: "mayo", 6: "junio",
    7: "julio", 8: "agosto", 9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
}


def obtener_estado(cur, clave):
    cur.execute("select valor from notificaciones_estado where clave = %s", (clave,))
    fila = cur.fetchone()
    return fila[0] if fila else None


def guardar_estado(cur, clave, valor):
    cur.execute(
        """
        insert into notificaciones_estado (clave, valor, actualizado_en)
        values (%s, %s, now())
        on conflict (clave) do update set valor = excluded.valor, actualizado_en = now()
        """,
        (clave, valor),
    )


def formatear_porcentaje(valor):
    numero = float(valor)
    if numero == int(numero):
        return f"{int(numero)}%"
    return f"{numero}%"


def parsear_hora(texto):
    coincidencia = re.match(r"(\d{1,2}):(\d{2})", texto or "")
    if not coincidencia:
        return Hora(21, 0)
    return Hora(int(coincidencia.group(1)), int(coincidencia.group(2)))


def combinar_fecha_hora(fecha, hora):
    return datetime.combine(fecha, hora, tzinfo=ZONA_BARCELONA)


def revisar_revalorizacion_diaria(cur):
    ahora = datetime.now(ZONA_BARCELONA)
    if ahora.hour < 8:
        return
    hoy = ahora.strftime("%Y-%m-%d")
    if obtener_estado(cur, "revalorizacion_diaria") == hoy:
        return

    cur.execute(
        """
        select coalesce(sum(j.diferencia_valor), 0)
        from mi_equipo_jugadores mej
        join jugadores j on j.id = mej.jugador_id
        where mej.estado in ('titular', 'suplente')
        """
    )
    total = cur.fetchone()[0] or 0
    mensaje = f"Buenos días, tu club hoy se ha revalorizado {Común.formatear_miles(total)} de euros."
    if Común.enviar_telegram(mensaje):
        guardar_estado(cur, "revalorizacion_diaria", hoy)


def revisar_titularidad(cur):
    cur.execute(
        """
        select j.id, j.nombre, j.porcentaje_titularidad, j.estado
        from mi_equipo_jugadores mej
        join jugadores j on j.id = mej.jugador_id
        """
    )
    for jugador_id, nombre, actual, estado_jugador in cur.fetchall():
        if actual is None:
            continue
        clave = f"titularidad:{jugador_id}"
        anterior = obtener_estado(cur, clave)
        if anterior is not None and float(actual) < float(anterior):
            mensaje = (
                f"El porcentaje de titularidad del jugador {nombre} ha pasado de ser de un "
                f"{formatear_porcentaje(anterior)} a un {formatear_porcentaje(actual)}, "
                f"el estado del jugador es {estado_jugador or 'Disponible'}."
            )
            if Común.enviar_telegram(mensaje):
                guardar_estado(cur, clave, str(actual))
        else:
            guardar_estado(cur, clave, str(actual))


def revisar_tarjetas_amarillas(cur):
    cur.execute(
        """
        select j.id, j.nombre,
          coalesce((
            select sum(d.cantidad) from puntos_jornada_detalle d
            where d.id = j.id and d.estadistica = 'tarjetas amarillas'
          ), 0) as amarillas
        from mi_equipo_jugadores mej
        join jugadores j on j.id = mej.jugador_id
        """
    )
    for jugador_id, nombre, amarillas in cur.fetchall():
        amarillas = int(amarillas)
        clave = f"amarillas:{jugador_id}"
        anterior = obtener_estado(cur, clave)
        anterior_num = int(anterior) if anterior is not None else 0
        if anterior_num < 4 and amarillas >= 4:
            mensaje = f"El jugador {nombre} lleva un total de 4 tarjetas amarillas acumuladas."
            if Común.enviar_telegram(mensaje):
                guardar_estado(cur, clave, str(amarillas))
        else:
            guardar_estado(cur, clave, str(amarillas))


def revisar_fichas(cur):
    cur.execute("select fichas from mi_club where id = 1")
    fila = cur.fetchone()
    if not fila or fila[0] is None:
        return
    fichas = fila[0]
    clave = "fichas_24"
    anterior = obtener_estado(cur, clave)
    anterior_num = int(anterior) if anterior is not None else 0
    if anterior_num < 24 and fichas >= 24:
        if Común.enviar_telegram("Ya no puedes incorporar más jugadores a tu club."):
            guardar_estado(cur, clave, str(fichas))
    else:
        guardar_estado(cur, clave, str(fichas))


def obtener_proxima_jornada(cur):
    cur.execute(
        """
        select jornada from calendario
        where competicion = 'LaLiga' and fecha is not null
        order by fecha, hora
        limit 1
        """
    )
    fila = cur.fetchone()
    if not fila:
        return None
    jornada = fila[0]

    cur.execute(
        """
        select fecha, hora from calendario
        where competicion = 'LaLiga' and jornada = %s and fecha is not null
        order by fecha, hora
        limit 1
        """,
        (jornada,),
    )
    fecha, hora = cur.fetchone()
    return jornada, combinar_fecha_hora(fecha, parsear_hora(hora))


def revisar_inicio_jornada(cur):
    proxima = obtener_proxima_jornada(cur)
    if proxima is None:
        return
    jornada, inicio = proxima
    horas_restantes = (inicio - datetime.now(ZONA_BARCELONA)).total_seconds() / 3600
    if horas_restantes <= 0:
        return

    if horas_restantes <= 48:
        clave = f"jornada:{jornada}:48h"
        if obtener_estado(cur, clave) is None:
            mensaje = (
                f"El {MAPA_DIAS_SEMANA[inicio.weekday()]} {inicio.day} de {MAPA_MESES[inicio.month]} "
                f"a las {inicio.strftime('%H:%M')} h empieza una nueva jornada."
            )
            if Común.enviar_telegram(mensaje):
                guardar_estado(cur, clave, "enviado")

    if horas_restantes <= 2:
        clave_alineacion = f"jornada:{jornada}:2h_alineacion"
        if obtener_estado(cur, clave_alineacion) is None:
            cur.execute("select count(*) from mi_equipo_jugadores where estado = 'titular'")
            titulares = cur.fetchone()[0]
            if titulares < 11:
                mensaje = "A falta de 2 horas para el comienzo de una nueva jornada, tu alineación es incompleta."
                if Común.enviar_telegram(mensaje):
                    guardar_estado(cur, clave_alineacion, "enviado")

        clave_saldo = f"jornada:{jornada}:2h_saldo"
        if obtener_estado(cur, clave_saldo) is None:
            cur.execute("select dinero from mi_club where id = 1")
            fila = cur.fetchone()
            if fila and fila[0] is not None and fila[0] < 0:
                mensaje = "A falta de 2 horas para el comienzo de una nueva jornada, tu saldo es negativo."
                if Común.enviar_telegram(mensaje):
                    guardar_estado(cur, clave_saldo, "enviado")


def revisar_cierre_mercado(cur):
    ahora = datetime.now(ZONA_BARCELONA)
    if ahora.hour != 21:
        return
    hoy = ahora.strftime("%Y-%m-%d")
    clave = f"mercado_cierre:{hoy}"
    if obtener_estado(cur, clave) is not None:
        return
    if Común.enviar_telegram("En 1 hora se cerrará el mercado de hoy."):
        guardar_estado(cur, clave, "enviado")


def main():
    conexion = psycopg2.connect(Común.obtener_configuracion("DATABASE_URL"))
    try:
        with conexion.cursor() as cur:
            for funcion in [
                revisar_revalorizacion_diaria,
                revisar_titularidad,
                revisar_tarjetas_amarillas,
                revisar_fichas,
                revisar_inicio_jornada,
                revisar_cierre_mercado,
            ]:
                try:
                    funcion(cur)
                except Exception:
                    conexion.rollback()
                else:
                    conexion.commit()
    finally:
        conexion.close()


if __name__ == "__main__":
    main()
