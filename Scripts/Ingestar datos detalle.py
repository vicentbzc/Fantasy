import time

import Común

MAPA_ESTADISTICA = {
    "mins_played": "minutos jugados",
    "goals": "goles",
    "goal_assist": "asistencias de gol",
    "offtarget_att_assist": "asistencias sin gol",
    "pen_area_entries": "balones al área",
    "penalty_won": "penaltis provocados",
    "penalty_conceded": "penaltis cometidos",
    "penalty_save": "penaltis parados",
    "saves": "paradas",
    "effective_clearance": "despejes",
    "penalty_failed": "penaltis fallados",
    "own_goals": "goles en propia puerta",
    "goals_conceded": "goles en contra",
    "yellow_card": "tarjetas amarillas",
    "red_card": "tarjetas rojas",
    "total_scoring_att": "tiros a puerta",
    "won_contest": "regates",
    "ball_recovery": "balones recuperados",
    "poss_lost_all": "posesiones perdidas",
    "marca_points": "Puntos DAZN",
}


def extraer_jugador(id_oficial, nombre, equipo, detalle):
    filas_detalle = []
    minutos_totales = 0
    alguna_jornada = False

    for entrada in detalle.get("playerStats") or []:
        jornada = entrada.get("weekNumber")
        stats = entrada.get("stats") or {}
        if jornada is None:
            continue

        alguna_jornada = True
        minutos_semana = stats.get("mins_played")
        if minutos_semana:
            minutos_totales += minutos_semana[0]

        for orden, (clave_api, nombre_estadistica) in enumerate(MAPA_ESTADISTICA.items(), start=1):
            valor = stats.get(clave_api)
            if not valor:
                continue
            cantidad = valor[0]
            puntos = valor[1] if len(valor) > 1 else 0
            if not cantidad and not puntos:
                continue
            filas_detalle.append({
                "ID": id_oficial,
                "Jugador": nombre,
                "Equipo": equipo,
                "Jornada": jornada,
                "Orden": orden,
                "Estadística": nombre_estadistica,
                "Cantidad": cantidad,
                "Puntos": puntos,
            })

    return filas_detalle, (minutos_totales if alguna_jornada else None)


def guardar_detalle(filas, ruta_archivo=Común.ruta_datos("Datos Puntos jornada detalle.csv")):
    columnas = ["ID", "Jugador", "Equipo", "Jornada", "Orden", "Estadística", "Cantidad", "Puntos"]
    Común.guardar_csv(ruta_archivo, columnas, filas)


def guardar_minutos(filas, ruta_archivo=Común.ruta_datos("Datos Minutos.csv")):
    columnas = ["ID", "Minutos"]
    Común.guardar_csv(ruta_archivo, columnas, filas)


if __name__ == "__main__":
    sesion = Común.crear_sesion()

    try:
        token = Común.obtener_token_laliga_fantasy(sesion)
    except Común.ErrorBloqueo:
        token = None

    filas_detalle = []
    filas_minutos = []

    if token is not None:
        try:
            catalogo = Común.descargar_json_autenticado(
                sesion, f"{Común.URL_BASE_LALIGA_FANTASY}/players?x-lang=es", token
            )
        except Común.ErrorBloqueo:
            catalogo = []

        try:
            for jugador in catalogo:
                if not jugador.get("weekPoints"):
                    continue
                posicion = Común.MAPA_POSICION_OFICIAL.get(str(jugador.get("positionId")))
                if posicion is None:
                    continue
                equipo = Común.equipo_oficial_a_nombre_largo(jugador.get("teamId"))
                if equipo is None:
                    continue
                id_oficial = jugador.get("id")

                try:
                    detalle = Común.descargar_json_autenticado(
                        sesion, f"{Común.URL_BASE_LALIGA_FANTASY}/player/{id_oficial}?x-lang=es", token
                    )
                except Común.ErrorBloqueo:
                    break
                except Exception:
                    time.sleep(1)
                    continue

                nuevas_filas, minutos = extraer_jugador(id_oficial, jugador.get("nickname", ""), equipo, detalle)
                filas_detalle.extend(nuevas_filas)
                if minutos is not None:
                    filas_minutos.append({"ID": id_oficial, "Minutos": minutos})

                time.sleep(1)
        except KeyboardInterrupt:
            pass

    guardar_detalle(filas_detalle)
    guardar_minutos(filas_minutos)
