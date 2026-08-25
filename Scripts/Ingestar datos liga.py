import csv
import os
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import Común

ZONA_BARCELONA = ZoneInfo("Europe/Madrid")


def construir_propiedad_liga(sesion, token, id_liga, id_mi_equipo):
    propiedad = {}
    mi_club = None
    managers = {}
    try:
        standing = Común.descargar_json_autenticado(
            sesion,
            f"{Común.URL_BASE_LALIGA_FANTASY}/leagues/{id_liga}/standing?x-lang=es",
            token,
        )
    except Común.ErrorBloqueo:
        return propiedad, mi_club, managers

    for puesto in standing:
        id_equipo = puesto["team"]["id"]
        manager = puesto["team"].get("manager") or {}
        if manager.get("id") is not None:
            managers[manager["id"]] = manager.get("managerName", "")
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
            propiedad[jugador["playerMaster"]["id"]] = {
                "clausula": jugador["buyoutClause"],
                "dueño": (jugador.get("manager") or {}).get("managerName", ""),
                "protegido_hasta": jugador.get("buyoutClauseLockedEndTime", ""),
                "en_mercado": jugador.get("playerMarket") is not None,
            }
        if id_mi_equipo is not None and str(id_equipo) == str(id_mi_equipo):
            mi_club = {
                "Dinero": plantilla.get("teamMoney"),
                "Fichas": plantilla.get("playersNumber"),
                "Valor equipo": plantilla.get("teamValue"),
                "Manager": manager.get("managerName", ""),
            }
        time.sleep(1)

    try:
        mercado_libre = Común.descargar_json_autenticado(
            sesion,
            f"{Común.URL_BASE_LALIGA_FANTASY}/league/{id_liga}/market?x-lang=es",
            token,
        )
        for entrada in mercado_libre:
            id_jugador = (entrada.get("playerMaster") or {}).get("id")
            if id_jugador is not None:
                propiedad.setdefault(id_jugador, {
                    "clausula": None, "dueño": "", "protegido_hasta": "",
                })["en_mercado"] = True
    except Común.ErrorBloqueo:
        pass

    return propiedad, mi_club, managers


def guardar_managers(managers, ruta_archivo=Común.ruta_datos("Datos Managers.csv")):
    columnas = ["ID", "Nombre"]
    filas = [{"ID": id_manager, "Nombre": nombre} for id_manager, nombre in managers.items()]
    Común.guardar_csv(ruta_archivo, columnas, filas)


def guardar_mi_club(mi_club, ruta_archivo=Común.ruta_datos("Datos Mi club.csv")):
    columnas = ["Dinero", "Fichas", "Valor equipo", "Manager"]
    Común.guardar_csv(ruta_archivo, columnas, [mi_club] if mi_club else [])


def guardar_jugadores(filas, ruta_archivo=Común.ruta_datos("Datos Jugadores.csv")):
    columnas = [
        "ID", "Jugador", "Equipo", "Posición", "Valor", "Valor en la liga", "Foto",
        "Dueño", "Protegido hasta", "En mercado",
    ]
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


def construir_clasificacion_jornada(sesion, token, id_liga, jornada):
    if jornada is None:
        return []
    try:
        clasificacion = Común.descargar_json_autenticado(
            sesion,
            f"{Común.URL_BASE_LALIGA_FANTASY}/leagues/{id_liga}/standing/{jornada}?x-lang=es",
            token,
        )
    except Común.ErrorBloqueo:
        return []

    return [
        {
            "Jornada": jornada,
            "Posición": puesto.get("position"),
            "Equipo ID": (puesto.get("team") or {}).get("id"),
            "Mánager": (puesto.get("team") or {}).get("manager", {}).get("managerName", ""),
            "Puntos": puesto.get("points"),
        }
        for puesto in clasificacion
    ]


def guardar_clasificacion_jornada(filas, ruta_archivo=Común.ruta_datos("Datos Clasificacion jornada.csv")):
    columnas = ["Jornada", "Posición", "Equipo ID", "Mánager", "Puntos"]
    Común.guardar_csv(ruta_archivo, columnas, filas)


def construir_actividad_mercado(sesion, token, id_liga):
    try:
        actividad = Común.descargar_json_autenticado(
            sesion,
            f"{Común.URL_BASE_LALIGA_FANTASY}/leagues/{id_liga}/activity/0?x-lang=es",
            token,
        )
    except Común.ErrorBloqueo:
        return []

    return [
        {
            "ID": entrada.get("id"),
            "Tipo": entrada.get("activityTypeId"),
            "Jugador": entrada.get("playerMasterId"),
            "Usuario": entrada.get("user1Id"),
            "Usuario destino": entrada.get("user2Id", ""),
            "Importe": entrada.get("amount"),
            "Fecha": entrada.get("createdAt"),
        }
        for entrada in actividad
        if entrada.get("id") is not None
    ]


def guardar_actividad_mercado(filas, ruta_archivo=Común.ruta_datos("Datos Actividad mercado.csv")):
    columnas = ["ID", "Tipo", "Jugador", "Usuario", "Usuario destino", "Importe", "Fecha"]
    Común.guardar_csv(ruta_archivo, columnas, filas)


if __name__ == "__main__":
    sesion = Común.crear_sesion()
    id_liga = Común.obtener_configuracion("LALIGA_FANTASY_LEAGUE_ID")
    id_mi_equipo = Común.obtener_configuracion("LALIGA_FANTASY_TEAM_ID")

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

        propiedad, mi_club, managers = construir_propiedad_liga(sesion, token, id_liga, id_mi_equipo)

        filas = []
        filas_puntos = []
        ultima_jornada = None
        for jugador in catalogo:
            posicion = Común.MAPA_POSICION_OFICIAL.get(str(jugador.get("positionId")))
            if posicion is None:
                continue
            equipo = Común.equipo_oficial_a_nombre_largo(jugador.get("teamId"))
            if equipo is None:
                continue
            id_oficial = jugador.get("id")
            datos_propiedad = propiedad.get(id_oficial, {})
            try:
                valor_oficial = int(jugador.get("marketValue"))
                clausula = datos_propiedad.get("clausula")
                valor_liga = int(clausula) if clausula is not None else valor_oficial
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
                "Dueño": datos_propiedad.get("dueño", ""),
                "Protegido hasta": datos_propiedad.get("protegido_hasta", ""),
                "En mercado": datos_propiedad.get("en_mercado", False),
            })
            for semana in jugador.get("weekPoints") or []:
                jornada = semana.get("weekNumber")
                puntos = semana.get("points")
                if jornada is None or puntos is None:
                    continue
                if ultima_jornada is None or jornada > ultima_jornada:
                    ultima_jornada = jornada
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
            guardar_mi_club(mi_club)
            filas_clasificacion = construir_clasificacion_jornada(sesion, token, id_liga, ultima_jornada)
            guardar_clasificacion_jornada(filas_clasificacion)
            guardar_actividad_mercado(construir_actividad_mercado(sesion, token, id_liga))
            guardar_managers(managers)

    time.sleep(1)
