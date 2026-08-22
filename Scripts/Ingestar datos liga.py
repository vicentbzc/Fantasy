import csv
import os
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import Común

ZONA_BARCELONA = ZoneInfo("Europe/Madrid")


def construir_valores_liga(sesion, token, id_liga):
    valores = {}
    try:
        standing = Común.descargar_json_autenticado(
            sesion,
            f"{Común.URL_BASE_LALIGA_FANTASY}/leagues/{id_liga}/standing?x-lang=es",
            token,
        )
    except Común.ErrorBloqueo:
        return valores

    for puesto in standing:
        id_equipo = puesto["team"]["id"]
        try:
            plantilla = Común.descargar_json_autenticado(
                sesion,
                f"{Común.URL_BASE_LALIGA_FANTASY}/leagues/{id_liga}/teams/{id_equipo}?x-lang=es",
                token,
            )
        except Común.ErrorBloqueo:
            time.sleep(1)
            continue
        for jugador in plantilla.get("players", []):
            valores[jugador["playerMaster"]["id"]] = jugador["buyoutClause"]
        time.sleep(1)

    return valores


def guardar_jugadores(filas, ruta_archivo=Común.ruta_datos("Datos Jugadores.csv")):
    columnas = ["ID", "Jugador", "Equipo", "Posición", "Valor", "Valor en la liga", "Foto"]
    Común.guardar_csv(ruta_archivo, columnas, filas)


def guardar_historial(filas, ruta_archivo=Común.ruta_datos("Datos Historial valor.csv")):
    ahora = datetime.now(ZONA_BARCELONA)
    if ahora.hour < 8:
        return

    hoy = ahora.strftime("%d/%m/%Y")
    columnas = ["Fecha", "ID", "Jugador", "Equipo", "Valor"]

    archivo_existe = os.path.isfile(ruta_archivo)

    if archivo_existe:
        with open(ruta_archivo, encoding="utf-8") as f:
            ya_guardado_hoy = any(fila.startswith(hoy + ",") for fila in f)
        if ya_guardado_hoy:
            return

    with open(ruta_archivo, "a", newline="", encoding="utf-8") as f:
        escritor = csv.DictWriter(f, fieldnames=columnas)
        if not archivo_existe:
            escritor.writeheader()
        for fila in filas:
            escritor.writerow({
                "Fecha": hoy,
                "ID": fila["ID"],
                "Jugador": fila["Jugador"],
                "Equipo": fila["Equipo"],
                "Valor": fila["Valor en la liga"],
            })


def guardar_puntos_jornada(filas, ruta_archivo=Común.ruta_datos("Datos Puntos jornada.csv")):
    columnas = ["ID", "Jugador", "Equipo", "Jornada", "Puntos", "Estadísticas", "Tarjetas amarillas acumuladas"]
    Común.guardar_csv(ruta_archivo, columnas, filas)


if __name__ == "__main__":
    sesion = Común.crear_sesion()
    id_liga = Común.obtener_configuracion("LALIGA_FANTASY_LEAGUE_ID")

    try:
        token = Común.obtener_token_laliga_fantasy(sesion)
    except Común.ErrorBloqueo:
        token = None

    if token is not None:
        try:
            catalogo = Común.descargar_json_autenticado(
                sesion,
                f"{Común.URL_BASE_LALIGA_FANTASY}/players?x-lang=es",
                token,
            )
        except Común.ErrorBloqueo:
            catalogo = []

        valores_liga = construir_valores_liga(sesion, token, id_liga)

        filas = []
        filas_puntos = []
        for jugador in catalogo:
            posicion = Común.MAPA_POSICION_OFICIAL.get(str(jugador.get("positionId")))
            if posicion is None:
                continue
            equipo = Común.equipo_oficial_a_nombre_largo(jugador.get("teamId"))
            if equipo is None:
                continue
            id_oficial = jugador.get("id")
            try:
                valor_oficial = int(jugador.get("marketValue"))
                valor_liga = int(valores_liga.get(id_oficial, valor_oficial))
            except (TypeError, ValueError):
                continue
            foto = jugador.get("image", "")
            if not foto.startswith(Común.PREFIJO_ASSETS_LALIGA_FANTASY):
                foto = ""
            filas.append({
                "ID": id_oficial,
                "Jugador": jugador.get("nickname", ""),
                "Equipo": equipo,
                "Posición": posicion,
                "Valor": Común.formatear_miles(valor_oficial),
                "Valor en la liga": Común.formatear_miles(valor_liga),
                "Foto": foto,
            })
            for semana in jugador.get("weekPoints") or []:
                jornada = semana.get("weekNumber")
                puntos = semana.get("points")
                if jornada is None or puntos is None:
                    continue
                filas_puntos.append({
                    "ID": id_oficial,
                    "Jugador": jugador.get("nickname", ""),
                    "Equipo": equipo,
                    "Jornada": jornada,
                    "Puntos": puntos,
                    "Estadísticas": "",
                    "Tarjetas amarillas acumuladas": "",
                })

        if filas:
            guardar_jugadores(filas)
            guardar_historial(filas)
            guardar_puntos_jornada(filas_puntos)

    time.sleep(1)
