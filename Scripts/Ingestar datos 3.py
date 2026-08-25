import re
import time
from datetime import date as Fecha

from bs4 import BeautifulSoup

import Común

SLUGS_EQUIPO = {
    "Sevilla": "sevilla",
    "Athletic": "athletic",
    "Barcelona": "barcelona",
    "Espanyol": "espanyol",
    "Real Madrid": "real-madrid",
    "Atlético": "atletico",
    "Deportivo": "deportivo",
    "Betis": "betis",
    "Levante": "levante",
    "Real Sociedad": "real-sociedad",
    "Racing": "racing",
    "Valencia": "valencia",
    "Osasuna": "osasuna",
    "Alavés": "alaves",
    "Elche": "elche",
    "Villarreal": "villarreal",
    "Celta": "celta",
    "Rayo": "rayo-vallecano",
    "Getafe": "getafe",
    "Málaga": "malaga",
}

MAPA_DIFICULTAD = {
    "vertical_1.jpg": "Muy baja",
    "vertical_2.jpg": "Baja",
    "vertical_3.jpg": "Media",
    "vertical_4.jpg": "Alta",
    "vertical_5.jpg": "Muy alta",
}

MAPA_DIAS_ABREVIADOS = {
    "Lun": "Lunes", "Mar": "Martes", "Mie": "Miércoles", "Jue": "Jueves",
    "Vie": "Viernes", "Sab": "Sábado", "Dom": "Domingo",
}

MINIMO_PARTIDOS_LIGA = 6


def formatear_hora(texto_hora):
    if texto_hora.endswith("h") and not texto_hora.endswith(" h"):
        return texto_hora[:-1] + " h"
    return texto_hora


def expandir_dia_semana(fecha_texto):
    partes = fecha_texto.split(" ", 1)
    if len(partes) == 2 and partes[0] in MAPA_DIAS_ABREVIADOS:
        return f"{MAPA_DIAS_ABREVIADOS[partes[0]]} {partes[1]}"
    return fecha_texto


def normalizar_jornada(texto_jornada):
    if re.fullmatch(r"J\d+", texto_jornada):
        return "Jornada " + texto_jornada[1:]
    return texto_jornada


def parsear_fecha_corta(dia, mes, hoy):
    fecha = Fecha(hoy.year, mes, dia)
    if fecha < hoy:
        fecha = Fecha(hoy.year + 1, mes, dia)
    return fecha


def _leer_probabilidad(marcador):
    camiseta_tag = marcador.select_one("a.camiseta")
    probabilidad_texto = camiseta_tag.get("data-probabilidad", "0%") if camiseta_tag else "0%"
    try:
        return int(probabilidad_texto.rstrip("%"))
    except ValueError:
        return 0


def _leer_nombre(marcador):
    nombre_tag = marcador.select_one(".truncate-name")
    return nombre_tag.get_text(strip=True) if nombre_tag else ""


def extraer_formacion(html):
    soup = BeautifulSoup(html, "html.parser")
    por_slot = {}
    for marcador in soup.select(".camiseta-wrapper"):
        if marcador.get("data-onceff") != "titular":
            continue
        if "tipo_campo" not in (marcador.get("class") or []):
            continue
        estilo = marcador.get("style", "")
        coincidencia_x = re.search(r"left:\s*([\d.]+)%", estilo)
        coincidencia_y = re.search(r"top:\s*([\d.]+)%", estilo)
        if not (coincidencia_x and coincidencia_y):
            continue
        nombre = _leer_nombre(marcador)
        if not nombre:
            continue

        probabilidad = _leer_probabilidad(marcador)

        slot = (coincidencia_x.group(1), coincidencia_y.group(1))
        actual = por_slot.get(slot)
        if actual is None or probabilidad > actual["probabilidad"]:
            por_slot[slot] = {"nombre": nombre, "x": slot[0], "y": slot[1], "probabilidad": probabilidad}

    por_nombre = {}
    for jugador in por_slot.values():
        actual = por_nombre.get(jugador["nombre"])
        if actual is None or jugador["probabilidad"] > actual["probabilidad"]:
            por_nombre[jugador["nombre"]] = jugador

    return list(por_nombre.values())


def extraer_suplentes(html):
    soup = BeautifulSoup(html, "html.parser")
    por_nombre = {}
    for marcador in soup.select(".camiseta-wrapper"):
        if marcador.get("data-onceff") != "suplente":
            continue
        nombre = _leer_nombre(marcador)
        if not nombre:
            continue

        probabilidad = _leer_probabilidad(marcador)

        actual = por_nombre.get(nombre)
        if actual is None or probabilidad > actual["probabilidad"]:
            por_nombre[nombre] = {"nombre": nombre, "probabilidad": probabilidad}

    return list(por_nombre.values())


def extraer_rival_ficha(html, nombre_corto):
    soup = BeautifulSoup(html, "html.parser")
    seccion = soup.select_one(".alineacion-partido")
    if not seccion:
        return None
    local_tag = seccion.select_one(".equipo.local")
    visitante_tag = seccion.select_one(".equipo.visitante")
    local_nombre = local_tag.get_text(strip=True) if local_tag else ""
    visitante_nombre = visitante_tag.get_text(strip=True) if visitante_tag else ""
    if local_nombre == nombre_corto:
        return visitante_nombre
    if visitante_nombre == nombre_corto:
        return local_nombre
    return None


def _partido_a_evento(partido, nombre_corto):
    competicion_tag = partido.select_one(".logo img")
    competicion = competicion_tag.get("alt", "") if competicion_tag else ""

    local_tag = partido.select_one(".equipo.local img")
    visitante_tag = partido.select_one(".equipo.visitante img")
    local_nombre = local_tag.get("alt", "") if local_tag else ""
    visitante_nombre = visitante_tag.get("alt", "") if visitante_tag else ""
    if local_nombre == nombre_corto:
        rival, localia = visitante_nombre, "Local"
    else:
        rival, localia = local_nombre, "Visitante"

    fase_tag = partido.select_one(".fase")
    jornada = normalizar_jornada(fase_tag.get_text(strip=True) if fase_tag else "")

    date_tag = partido.select_one(".date")
    texto_fecha = date_tag.get_text(" ", strip=True) if date_tag else ""
    if " " in texto_fecha:
        fecha_texto, hora = texto_fecha.rsplit(" ", 1)
    else:
        fecha_texto, hora = texto_fecha, ""
    dia, mes = (int(x) for x in fecha_texto.split()[-1].split("/"))
    fecha_texto = expandir_dia_semana(fecha_texto)
    fecha_obj = parsear_fecha_corta(dia, mes, Fecha.today())

    img_dificultad = partido.select_one(".dificultad-container img.dificultad")
    if img_dificultad:
        archivo = img_dificultad.get("src", "").rsplit("/", 1)[-1]
        dificultad = MAPA_DIFICULTAD.get(archivo, "")
    else:
        dificultad = ""

    return {
        "fecha_obj": fecha_obj,
        "rival": rival,
        "competicion": competicion,
        "jornada": jornada,
        "fecha_texto": fecha_texto,
        "fecha_iso": fecha_obj.isoformat(),
        "hora": formatear_hora(hora),
        "local_o_visitante": localia,
        "dificultad": dificultad,
    }


def eventos_desde_partidos(html, nombre_corto):
    soup = BeautifulSoup(html, "html.parser")
    seccion = soup.select_one("section.partidos.proximos")
    partidos = seccion.select("a.partido") if seccion else []

    eventos = []
    partidos_liga = 0
    for partido in partidos:
        eventos.append(_partido_a_evento(partido, nombre_corto))
        if eventos[-1]["competicion"] == "LaLiga":
            partidos_liga += 1
            if partidos_liga >= MINIMO_PARTIDOS_LIGA:
                break

    eventos.sort(key=lambda e: e["fecha_obj"])
    return eventos


def extraer_calendario(sesion, nombre_corto, slug):
    html_partidos = Común.descargar_pagina(sesion, f"https://www.futbolfantasy.com/laliga/equipos/{slug}/partidos")
    eventos = eventos_desde_partidos(html_partidos, nombre_corto)

    unir = lambda clave: " | ".join(e[clave] for e in eventos)
    rivales_oficiales = " | ".join(Común.MAPA_EQUIPOS.get(e["rival"], e["rival"]) for e in eventos)
    datos = {
        "Siguientes rivales": rivales_oficiales,
        "Competición": unir("competicion"),
        "Jornada": unir("jornada"),
        "Día": unir("fecha_texto"),
        "Fecha": unir("fecha_iso"),
        "Hora": unir("hora"),
        "Estadio": unir("local_o_visitante"),
        "Dificultad de los rivales": unir("dificultad"),
    }
    return datos, eventos


def guardar_csv(filas, ruta_archivo=Común.ruta_datos("Datos 3.csv")):
    columnas = [
        "Equipo", "Siguientes rivales", "Competición", "Jornada",
        "Día", "Fecha", "Hora", "Estadio", "Dificultad de los rivales",
    ]
    Común.guardar_csv(ruta_archivo, columnas, filas)


def guardar_posiciones(filas, ruta_archivo=Común.ruta_datos("Datos Posicion.csv")):
    columnas = ["Equipo", "Jugador", "Posicion X", "Posicion Y", "Probabilidad"]
    Común.guardar_csv(ruta_archivo, columnas, filas)


if __name__ == "__main__":
    sesion = Común.crear_sesion()

    filas = []
    filas_posicion = []
    try:
        for nombre_oficial, nombre_corto in Común.MAPA_EQUIPOS_INVERSO.items():
            slug = SLUGS_EQUIPO[nombre_corto]
            try:
                html_ficha = Común.descargar_pagina(sesion, f"https://www.futbolfantasy.com/laliga/equipos/{slug}")
                time.sleep(1)
                datos, eventos = extraer_calendario(sesion, nombre_corto, slug)
            except Común.ErrorBloqueo:
                break
            except Exception:
                time.sleep(1)
                continue
            datos["Equipo"] = nombre_oficial
            filas.append(datos)

            proxima_liga = next((e for e in eventos if e["competicion"] == "LaLiga"), None)
            rival_ficha = extraer_rival_ficha(html_ficha, nombre_corto)
            alineacion_es_de_liga = (
                proxima_liga is not None
                and rival_ficha is not None
                and Común.normalizar_nombre(rival_ficha) == Común.normalizar_nombre(proxima_liga["rival"])
            )
            if alineacion_es_de_liga:
                candidatos = {}
                for jugador in extraer_formacion(html_ficha):
                    candidatos[jugador["nombre"]] = {
                        "Equipo": nombre_oficial,
                        "Jugador": jugador["nombre"],
                        "Posicion X": jugador["x"],
                        "Posicion Y": jugador["y"],
                        "Probabilidad": jugador["probabilidad"],
                    }
                for jugador in extraer_suplentes(html_ficha):
                    actual = candidatos.get(jugador["nombre"])
                    if actual is None or jugador["probabilidad"] > actual["Probabilidad"]:
                        candidatos[jugador["nombre"]] = {
                            "Equipo": nombre_oficial,
                            "Jugador": jugador["nombre"],
                            "Posicion X": "",
                            "Posicion Y": "",
                            "Probabilidad": jugador["probabilidad"],
                        }
                filas_posicion.extend(candidatos.values())

            time.sleep(1)
    except KeyboardInterrupt:
        pass

    guardar_csv(filas)
    guardar_posiciones(filas_posicion)
