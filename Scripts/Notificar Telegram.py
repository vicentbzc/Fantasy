import re
from datetime import datetime, timezone
from datetime import time as Hora
from zoneinfo import ZoneInfo

import psycopg2

import Común

ZONA_BARCELONA = ZoneInfo("Europe/Madrid")

MAPA_DIAS_SEMANA = {
    0: "lunes", 1: "martes", 2: "miércoles", 3: "jueves",
    4: "viernes", 5: "sábado", 6: "domingo",
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

    cur.execute("select manager from mi_club where id = 1")
    fila = cur.fetchone()
    if not fila or not fila[0]:
        return
    mi_manager = fila[0]

    cur.execute(
        """
        select coalesce(sum(j.valor - h.valor_oficial), 0)
        from jugadores j
        join lateral (
            select valor_oficial
            from historial_valor
            where id = j.id and fecha < current_date and valor_oficial is not null
            order by fecha desc
            limit 1
        ) h on true
        where j.dueno = %s and j.valor is not null
        """,
        (mi_manager,),
    )
    total = cur.fetchone()[0] or 0
    mensaje = f"Tu equipo hoy se ha revalorizado {Común.formatear_miles(total)}€."
    if Común.enviar_telegram(mensaje):
        guardar_estado(cur, "revalorizacion_diaria", hoy)


UMBRAL_RETRASO_MINUTOS = 20

NOMBRES_ARCHIVOS_5_MIN = {
    "Datos Jugadores.csv": "Ingestar datos liga.py (Valor, Valor en la liga, Puntos)",
    "Datos Titularidad.csv": "Ingestar datos 1.py (Titularidad)",
    "Datos Estado.csv": "Ingestar datos estado.py (Estado)",
}


def revisar_retraso_ingesta(cur):
    ahora = datetime.now(timezone.utc)
    for nombre_archivo, nombre_legible in NOMBRES_ARCHIVOS_5_MIN.items():
        cur.execute(
            "select actualizado_en from notificaciones_estado where clave = %s",
            (f"fresco_ingesta:{nombre_archivo}",),
        )
        fila = cur.fetchone()
        if not fila:
            continue

        minutos = (ahora - fila[0]).total_seconds() / 60
        clave_aviso = f"retraso_ingesta:{nombre_archivo}"
        if minutos > UMBRAL_RETRASO_MINUTOS:
            if obtener_estado(cur, clave_aviso) != "avisado":
                mensaje = (
                    f"{nombre_legible} lleva {int(minutos)} minutos sin traer datos nuevos "
                    f"(se esperaba cada 5 min)."
                )
                if Común.enviar_telegram(mensaje):
                    guardar_estado(cur, clave_aviso, "avisado")
        else:
            guardar_estado(cur, clave_aviso, "ok")


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


def revisar_seguimiento_sin_cambio_dueno(cur):
    cur.execute(
        """
        select j.id, j.nombre, j.diferencia_valor, j.dueno
        from mi_equipo_jugadores mej
        join jugadores j on j.id = mej.jugador_id
        where mej.estado = 'seguimiento'
        """
    )
    for jugador_id, nombre, diferencia, dueno in cur.fetchall():
        clave_dueno = f"seguimiento_dueno:{jugador_id}"
        dueno_anterior = obtener_estado(cur, clave_dueno)
        dueno_actual = dueno or ""
        mismo_dueno = dueno_anterior is not None and dueno_anterior == dueno_actual

        if mismo_dueno and diferencia not in (None, 0):
            clave_valor = f"seguimiento_valor:{jugador_id}"
            marca = f"{dueno_actual}:{diferencia}"
            if obtener_estado(cur, clave_valor) != marca:
                mensaje = (
                    f"El jugador {nombre}, que tienes en seguimiento, ha cambiado de valor "
                    f"({Común.formatear_miles(diferencia)}) sin cambiar de dueño."
                )
                if Común.enviar_telegram(mensaje):
                    guardar_estado(cur, clave_valor, marca)

        guardar_estado(cur, clave_dueno, dueno_actual)


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


def numero_jornada(texto):
    coincidencia = re.search(r"\d+", texto or "")
    return int(coincidencia.group()) if coincidencia else 0


def obtener_proxima_jornada(cur):
    cur.execute(
        """
        select distinct on (equipo) equipo, jornada
        from calendario
        where competicion = 'LaLiga' and fecha is not null
        order by equipo, orden
        """
    )
    conteo = {}
    for _equipo, jornada in cur.fetchall():
        conteo[jornada] = conteo.get(jornada, 0) + 1
    if not conteo:
        return None
    jornada = max(conteo, key=lambda j: (conteo[j], -numero_jornada(j)))

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


def revisar_puntos_dazn_jornada(cur):
    id_mi_equipo = Común.obtener_configuracion("LALIGA_FANTASY_TEAM_ID")
    if not id_mi_equipo:
        return

    cur.execute("select max(jornada) from clasificacion_jornada")
    fila = cur.fetchone()
    jornada = fila[0] if fila else None
    if jornada is None:
        return

    clave = f"puntos_dazn_jornada:{jornada}"
    if obtener_estado(cur, clave) is not None:
        return

    cur.execute("select 1 from calendario where jornada = %s limit 1", (f"Jornada {jornada}",))
    if cur.fetchone() is not None:
        return

    cur.execute(
        "select posicion, puntos from clasificacion_jornada where jornada = %s and equipo_id = %s",
        (jornada, str(id_mi_equipo)),
    )
    fila = cur.fetchone()
    if not fila:
        return
    posicion, puntos = fila

    mensaje = (
        f"Terminaste la jornada {jornada} en la posición {posicion} de la clasificación, "
        f"con {puntos} puntos."
    )
    if Común.enviar_telegram(mensaje):
        guardar_estado(cur, clave, "enviado")


MAPA_TIPO_ACTIVIDAD = {
    1: "{usuario} le ha comprado {jugador} a {destino} por {importe}.",
}

TIPOS_ACTIVIDAD_EXCLUIDOS = {6, 31, 33}


def revisar_actividad_mercado(cur):
    clave = "actividad_mercado_ultimo_id"
    ultimo_id_texto = obtener_estado(cur, clave)

    if ultimo_id_texto is None:
        cur.execute("select coalesce(max(id), 0) from actividad_mercado")
        guardar_estado(cur, clave, str(cur.fetchone()[0]))
        return

    ultimo_id = int(ultimo_id_texto)
    cur.execute(
        """
        select am.id, am.tipo, am.importe,
               coalesce(j.nombre, 'un jugador'), coalesce(m1.nombre, 'Alguien'), m2.nombre
        from actividad_mercado am
        left join jugadores j on j.id = am.jugador_id
        left join managers m1 on m1.id = am.usuario_id
        left join managers m2 on m2.id = am.usuario_destino_id
        where am.id > %s
        order by am.id
        """,
        (ultimo_id,),
    )

    for id_actividad, tipo, importe, jugador, usuario, destino in cur.fetchall():
        if tipo in TIPOS_ACTIVIDAD_EXCLUIDOS or "Vicent" in (usuario or "") or "Vicent" in (destino or ""):
            guardar_estado(cur, clave, str(id_actividad))
            continue

        importe_texto = Común.formatear_miles(importe) if importe is not None else "—"
        plantilla = MAPA_TIPO_ACTIVIDAD.get(tipo)
        if plantilla:
            mensaje = plantilla.format(
                usuario=usuario, jugador=jugador, destino=destino or "otro mánager", importe=importe_texto
            )
        else:
            mensaje = f"{usuario} ha hecho una operación de mercado con {jugador} por {importe_texto}."

        if not Común.enviar_telegram(mensaje):
            break
        guardar_estado(cur, clave, str(id_actividad))


COMPETICIONES_CON_LOGO = {"LaLiga", "Conference League"}


def revisar_competicion_sin_logo(cur):
    cur.execute("select distinct competicion from calendario where competicion is not null")
    for (competicion,) in cur.fetchall():
        if competicion in COMPETICIONES_CON_LOGO:
            continue
        clave = f"competicion_sin_logo:{competicion}"
        if obtener_estado(cur, clave) is not None:
            continue
        mensaje = f"Falta el logo de la competición '{competicion}' en la web."
        if Común.enviar_telegram(mensaje):
            guardar_estado(cur, clave, "avisado")


HORA_CIERRE_MERCADO = 22


def revisar_cierre_mercado(cur):
    ahora = datetime.now(ZONA_BARCELONA)
    cierre = ahora.replace(hour=HORA_CIERRE_MERCADO, minute=0, second=0, microsecond=0)
    minutos_para_cierre = (cierre - ahora).total_seconds() / 60
    if not (0 < minutos_para_cierre <= 120):
        return
    hoy = ahora.strftime("%Y-%m-%d")
    clave = f"mercado_cierre:{hoy}"
    if obtener_estado(cur, clave) is not None:
        return
    minutos_redondeados = round(minutos_para_cierre)
    if minutos_redondeados >= 115:
        texto_tiempo = "2 horas"
    elif minutos_redondeados > 60:
        horas, minutos = divmod(minutos_redondeados, 60)
        texto_horas = "1 hora" if horas == 1 else f"{horas} horas"
        texto_tiempo = f"{texto_horas} y {minutos} minuto{'s' if minutos != 1 else ''}"
    elif minutos_redondeados >= 55:
        texto_tiempo = "1 hora"
    elif minutos_redondeados == 1:
        texto_tiempo = "1 minuto"
    else:
        texto_tiempo = f"{minutos_redondeados} minutos"
    if Común.enviar_telegram(f"En {texto_tiempo} se cerrará el mercado de hoy."):
        guardar_estado(cur, clave, "enviado")


def main():
    conexion = psycopg2.connect(Común.obtener_configuracion("DATABASE_URL"))
    try:
        with conexion.cursor() as cur:
            for funcion in [
                revisar_revalorizacion_diaria,
                revisar_retraso_ingesta,
                revisar_titularidad,
                revisar_seguimiento_sin_cambio_dueno,
                revisar_tarjetas_amarillas,
                revisar_fichas,
                revisar_inicio_jornada,
                revisar_puntos_dazn_jornada,
                revisar_actividad_mercado,
                revisar_competicion_sin_logo,
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
